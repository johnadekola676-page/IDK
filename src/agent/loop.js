import { executePlanPhase } from './phases/plan.js';
import { executeExecutePhase } from './phases/execute.js';
import { executeTestPhase } from './phases/test.js';
import { executeDeployPhase } from './phases/deploy.js';
import { executeMonitorPhase } from './phases/monitor.js';
import { fixErrors } from '../groq/client.js';
import { buildErrorContext } from '../groq/prompts.js';
import { createAgentRun, updateAgentRun } from '../database/queries.js';
import { addToContext } from './context.js';
import { readFileSafe } from '../utils/filesystem.js';
import logger from '../utils/logger.js';

const MAX_RETRY_COUNT = parseInt(process.env.MAX_RETRY_COUNT || '10', 10);

/**
 * Execute complete agent loop with self-healing
 * @param {string} task - Task description
 * @param {number} sessionId - Session ID
 * @param {Function} progressCallback - Progress callback function
 * @returns {Promise<Object>} Final result
 */
export async function executeAgentLoop(task, sessionId, progressCallback = null) {
  logger.info('Starting agent loop', { task, sessionId });

  const results = {
    plan: null,
    execute: null,
    test: null,
    deploy: null,
    monitor: null,
    retryCount: 0,
    success: false
  };

  try {
    // Add user message to context
    await addToContext(sessionId, 'user', task);

    // PHASE 1: PLAN
    await reportProgress('plan', 'running', progressCallback);
    const planRunId = createAgentRun(sessionId, 'plan');

    results.plan = await executePlanPhase(task);

    if (!results.plan.success) {
      updateAgentRun(planRunId, 'failed', results.plan.error);
      await reportProgress('plan', 'failed', progressCallback, results.plan);
      return results;
    }

    updateAgentRun(planRunId, 'success');
    await reportProgress('plan', 'success', progressCallback, results.plan);

    // Self-healing loop for EXECUTE and TEST phases
    let healingAttempt = 0;
    let executeSuccess = false;
    let lastError = null;

    while (healingAttempt < MAX_RETRY_COUNT && !executeSuccess) {
      // PHASE 2: EXECUTE
      await reportProgress('execute', 'running', progressCallback, { attempt: healingAttempt + 1 });
      const executeRunId = createAgentRun(sessionId, 'execute', { attempt: healingAttempt + 1 });

      results.execute = await executeExecutePhase(
        results.plan.plan,
        task,
        { attempt: healingAttempt }
      );

      if (!results.execute.success) {
        updateAgentRun(executeRunId, 'failed', results.execute.error, healingAttempt);
        lastError = results.execute.error;
        healingAttempt++;
        continue;
      }

      updateAgentRun(executeRunId, 'success', null, healingAttempt);
      await reportProgress('execute', 'success', progressCallback, results.execute);

      // PHASE 3: TEST
      await reportProgress('test', 'running', progressCallback);
      const testRunId = createAgentRun(sessionId, 'test');

      results.test = await executeTestPhase(results.execute);

      if (!results.test.success && !results.test.skipped) {
        updateAgentRun(testRunId, 'failed', results.test.error, healingAttempt);
        await reportProgress('test', 'failed', progressCallback, results.test);

        // Enter self-healing mode
        logger.info('Entering self-healing mode', {
          attempt: healingAttempt + 1,
          maxRetries: MAX_RETRY_COUNT
        });

        if (healingAttempt < MAX_RETRY_COUNT - 1) {
          await healSelf(results, task, healingAttempt);
          healingAttempt++;
          results.retryCount = healingAttempt;
          await reportProgress('healing', 'running', progressCallback, {
            attempt: healingAttempt,
            maxRetries: MAX_RETRY_COUNT
          });
          continue;
        } else {
          logger.error('Max retries reached', { retryCount: healingAttempt });
          return results;
        }
      }

      updateAgentRun(testRunId, 'success', null, healingAttempt);
      await reportProgress('test', 'success', progressCallback, results.test);
      executeSuccess = true;
    }

    if (!executeSuccess) {
      logger.error('Failed to execute successfully after retries');
      return results;
    }

    // PHASE 4: DEPLOY
    await reportProgress('deploy', 'running', progressCallback);
    const deployRunId = createAgentRun(sessionId, 'deploy');

    results.deploy = await executeDeployPhase(results.execute, results.test);

    if (!results.deploy.success) {
      updateAgentRun(deployRunId, 'failed', results.deploy.error);
      await reportProgress('deploy', 'failed', progressCallback, results.deploy);
      return results;
    }

    updateAgentRun(deployRunId, 'success');
    await reportProgress('deploy', 'success', progressCallback, results.deploy);

    // PHASE 5: MONITOR
    await reportProgress('monitor', 'running', progressCallback);
    const monitorRunId = createAgentRun(sessionId, 'monitor');

    results.monitor = await executeMonitorPhase(results.deploy, {
      timeoutMs: 300000, // 5 minutes
      pollIntervalMs: 20000 // 20 seconds
    });

    if (!results.monitor.success && !results.monitor.skipped) {
      updateAgentRun(monitorRunId, 'failed', results.monitor.error);
      await reportProgress('monitor', 'failed', progressCallback, results.monitor);
      return results;
    }

    updateAgentRun(monitorRunId, 'success');
    await reportProgress('monitor', 'success', progressCallback, results.monitor);

    // Overall success
    results.success = true;
    logger.info('Agent loop completed successfully', { sessionId, retryCount: healingAttempt });

    return results;
  } catch (error) {
    logger.error('Agent loop failed', { error: error.message, sessionId });
    results.error = error.message;
    await reportProgress('error', 'failed', progressCallback, { error: error.message });
    return results;
  }
}

/**
 * Self-healing: fix errors and update implementation
 * @param {Object} results - Current results
 * @param {string} task - Original task
 * @param {number} retryCount - Current retry count
 */
async function healSelf(results, task, retryCount) {
  try {
    logger.info('Attempting self-heal', { retryCount });

    // Get the error information
    const errorInfo = {
      exitCode: results.test.exitCode,
      stdout: results.test.stdout,
      stderr: results.test.stderr
    };

    // For each modified file, attempt to fix
    for (const file of results.execute.filesModified || []) {
      try {
        // Read current code
        const currentCode = await readFileSafe(file);

        // Generate fix using AI
        const errorMessage = `${errorInfo.stderr}\n\nStdout:\n${errorInfo.stdout}`;
        const fixedCode = await fixErrors(currentCode, errorMessage, retryCount);

        // Update the plan with fixed code approach
        const step = results.plan.plan.steps.find(s => s.file === file);
        if (step) {
          step.description = `Fix errors in ${file}: ${errorInfo.stderr.substring(0, 200)}`;
        }

        logger.info('Generated fix for file', { file, retryCount });
      } catch (error) {
        logger.error('Failed to generate fix', { file, error: error.message });
      }
    }

    // Wait a bit before retry (exponential backoff)
    const backoffMs = Math.min(1000 * Math.pow(2, retryCount), 10000);
    await new Promise(resolve => setTimeout(resolve, backoffMs));
  } catch (error) {
    logger.error('Self-healing failed', { error: error.message });
  }
}

/**
 * Report progress to callback
 * @param {string} phase - Phase name
 * @param {string} status - Phase status
 * @param {Function} callback - Callback function
 * @param {Object} data - Additional data
 */
async function reportProgress(phase, status, callback, data = {}) {
  if (callback && typeof callback === 'function') {
    try {
      await callback({ phase, status, ...data });
    } catch (error) {
      logger.warn('Progress callback failed', { error: error.message });
    }
  }
}

/**
 * Format loop results for display
 * @param {Object} results - Loop results
 * @returns {string} Formatted results
 */
export function formatLoopResults(results) {
  let text = '**Agent Execution Results**\n\n';

  // Plan
  if (results.plan) {
    text += `✓ **Plan**: ${results.plan.success ? 'Success' : 'Failed'}\n`;
    if (results.plan.success) {
      text += `  - Steps: ${results.plan.plan.steps.length}\n`;
      text += `  - Complexity: ${results.plan.plan.estimated_complexity}\n`;
    }
  }

  // Execute
  if (results.execute) {
    text += `${results.execute.success ? '✓' : '✗'} **Execute**: ${results.execute.success ? 'Success' : 'Failed'}\n`;
    if (results.execute.filesModified) {
      text += `  - Files modified: ${results.execute.filesModified.length}\n`;
    }
  }

  // Test
  if (results.test) {
    if (results.test.skipped) {
      text += `⊘ **Test**: Skipped\n`;
    } else {
      text += `${results.test.success ? '✓' : '✗'} **Test**: ${results.test.success ? 'Passed' : 'Failed'}\n`;
      if (results.test.insights) {
        text += `  - Tests: ${results.test.insights.passedTests}/${results.test.insights.totalTests} passed\n`;
      }
    }
  }

  // Deploy
  if (results.deploy) {
    if (results.deploy.skipped) {
      text += `⊘ **Deploy**: Skipped\n`;
    } else {
      text += `${results.deploy.success ? '✓' : '✗'} **Deploy**: ${results.deploy.success ? 'Success' : 'Failed'}\n`;
      if (results.deploy.commit) {
        text += `  - Commit: ${results.deploy.commit.hash.substring(0, 7)}\n`;
      }
    }
  }

  // Monitor
  if (results.monitor) {
    if (results.monitor.skipped) {
      text += `⊘ **Monitor**: Skipped\n`;
    } else {
      text += `${results.monitor.success ? '✓' : '✗'} **Monitor**: ${results.monitor.success ? 'Success' : 'Failed'}\n`;
      if (results.monitor.workflow) {
        text += `  - Workflow: ${results.monitor.workflow.conclusion}\n`;
      }
    }
  }

  // Retry info
  if (results.retryCount > 0) {
    text += `\n🔄 **Self-healing attempts**: ${results.retryCount}\n`;
  }

  // Overall status
  text += `\n**Overall**: ${results.success ? '✓ Success' : '✗ Failed'}`;

  return text;
}

export default {
  executeAgentLoop,
  formatLoopResults
};
