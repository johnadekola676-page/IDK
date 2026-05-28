import { createSession, getActiveSession, closeSession } from '../database/queries.js';
import { executeAgentLoop, formatLoopResults } from '../agent/loop.js';
import { reviewPullRequest, formatReviewResult } from '../github/pr-review.js';
import { getWorkflowStatus } from '../agent/phases/monitor.js';
import { ensureSandbox } from '../utils/filesystem.js';
import { validateUserInput, validatePRNumber, sanitizeForTelegram } from '../security/validation.js';
import logger from '../utils/logger.js';
import { formatMessage, formatSOPSummary, formatProgress } from './message-formatter.js';
import { isSOPEnabled } from '../agent/sop-integration.js';

/**
 * Handle /start command
 */
export async function handleStart(ctx) {
  const welcomeMessage = `
🤖 *Autonomous CI/CD Developer Agent*

Welcome! I'm your autonomous development assistant. I can:

• Execute development tasks with 5-phase self-healing
• Review pull requests for security & quality
• Monitor GitHub Actions workflows
• Automatically fix errors and retry

*Commands:*
/start - Show this message
/task <description> - Execute a development task
/review_pr <number> - Review a pull request
/status - Check workflow status
/help - Detailed help

*Example:*
/task Create a REST API endpoint for user authentication

Let's build something amazing! 🚀
`;

  await ctx.reply(welcomeMessage, { parse_mode: 'Markdown' });
}

/**
 * Handle /help command
 */
export async function handleHelp(ctx) {
  const helpMessage = `
📚 *Detailed Help*

*Available Commands:*

*/task <description>*
Execute an autonomous development task using the 5-phase loop:
1. Plan - Analyze & create implementation plan
2. Execute - Generate & write code
3. Test - Run tests & validate
4. Deploy - Commit & push to GitHub
5. Monitor - Watch CI/CD pipelines

Features:
- Self-healing (up to 10 retry attempts)
- Code review before commit
- Automatic error fixing
- Progress updates

*/review_pr <number>*
Review a pull request for:
- Security vulnerabilities
- Hardcoded credentials
- Malicious patterns
- Code quality issues
- Compliance with claude.md guidelines

*/status*
Check current GitHub Actions workflow status

*Safety Features:*
✓ Command blocklist (blocks dangerous operations)
✓ Sandboxed execution
✓ User authentication
✓ Path containment
✓ Process timeouts

Need help? Just ask!
`;

  await ctx.reply(helpMessage, { parse_mode: 'Markdown' });
}

/**
 * Handle /task command
 */
export async function handleTask(ctx) {
  const taskDescription = ctx.message.text.replace('/task', '').trim();

  // Validate input
  const validation = validateUserInput(taskDescription);
  if (!validation.valid) {
    await ctx.reply(`❌ Invalid input: ${validation.reason}`);
    return;
  }

  const userId = ctx.from.id;

  try {
    // Ensure sandbox is ready
    await ensureSandbox();

    // Create or get active session
    let session = getActiveSession(userId);
    if (!session) {
      const sessionId = createSession(userId);
      session = { id: sessionId };
    }

    // Send initial status
    const statusMessage = await ctx.reply('🚀 Starting autonomous agent execution...\n\nPhase: Planning');
    let lastPhase = 'plan';

    // Progress callback
    const progressCallback = async (progress) => {
      const { phase, status, attempt } = progress;

      let emoji = '⏳';
      if (status === 'success') emoji = '✓';
      if (status === 'failed') emoji = '✗';

      let text = `${emoji} **Phase: ${phase.toUpperCase()}** - ${status}`;

      if (attempt) {
        text += `\n🔄 Self-healing attempt ${attempt}/${process.env.MAX_RETRY_COUNT || 10}`;
      }

      // Only update if phase changed
      if (phase !== lastPhase || status === 'success' || status === 'failed') {
        try {
          await ctx.telegram.editMessageText(
            statusMessage.chat.id,
            statusMessage.message_id,
            null,
            text,
            { parse_mode: 'Markdown' }
          );
          lastPhase = phase;
        } catch (error) {
          // Ignore edit errors
        }
      }
    };

    // Execute agent loop
    logger.info('Executing agent loop for task', { task: taskDescription, userId });
    const results = await executeAgentLoop(taskDescription, session.id, progressCallback);

    // Format and send results
    let formattedResults;
    if (results.usedSOP && results.worksheetPath) {
      // Format SOP results
      formattedResults = formatSOPSummary(results.worksheetPath, results);
    } else {
      // Format standard loop results
      formattedResults = formatLoopResults(results);
    }
    await ctx.reply(formatMessage(formattedResults), { parse_mode: 'Markdown' });

    // Send detailed error if failed
    if (!results.success) {
      let errorDetails = '**Error Details:**\n\n';

      if (results.test && !results.test.success && !results.test.skipped) {
        errorDetails += `Test failed:\n\`\`\`\n${results.test.stderr?.substring(0, 500) || 'Unknown error'}\n\`\`\``;
      } else if (results.error) {
        errorDetails += `\`\`\`\n${results.error.substring(0, 500)}\n\`\`\``;
      }

      await ctx.reply(sanitizeForTelegram(errorDetails), { parse_mode: 'Markdown' });
    }

    // Send workflow link if available
    if (results.monitor && results.monitor.workflow) {
      await ctx.reply(
        `🔗 [View workflow run](${results.monitor.workflow.htmlUrl})`,
        { parse_mode: 'Markdown' }
      );
    }
  } catch (error) {
    logger.error('Task execution failed', { error: error.message, userId });
    await ctx.reply(`❌ Execution failed: ${sanitizeForTelegram(error.message)}`);
  }
}

/**
 * Handle /review_pr command
 */
export async function handleReviewPR(ctx) {
  const args = ctx.message.text.replace('/review_pr', '').trim();

  if (!args) {
    await ctx.reply('Usage: /review_pr <PR number>\n\nExample: /review_pr 42');
    return;
  }

  const prNumber = parseInt(args, 10);

  if (!validatePRNumber(prNumber)) {
    await ctx.reply('❌ Invalid PR number. Please provide a valid number.');
    return;
  }

  try {
    await ctx.reply(`🔍 Reviewing PR #${prNumber}...`);

    // Execute PR review
    const reviewResult = await reviewPullRequest(prNumber);

    // Format and send review
    const formattedReview = formatReviewResult(reviewResult);
    await ctx.reply(formattedReview, { parse_mode: 'Markdown' });

    // Send risk alert if critical
    if (reviewResult.review.risk_level === 'critical') {
      await ctx.reply(
        '🚨 **CRITICAL RISK DETECTED**\n\nThis PR contains critical security issues. Do NOT merge until issues are resolved.',
        { parse_mode: 'Markdown' }
      );
    }
  } catch (error) {
    logger.error('PR review failed', { prNumber, error: error.message });
    await ctx.reply(`❌ Failed to review PR: ${sanitizeForTelegram(error.message)}`);
  }
}

/**
 * Handle /status command
 */
export async function handleStatus(ctx) {
  try {
    await ctx.reply('Checking workflow status...');

    const status = await getWorkflowStatus();

    if (!status) {
      await ctx.reply('ℹ️ No workflow runs found.');
      return;
    }

    let statusEmoji = '⏳';
    if (status.conclusion === 'success') statusEmoji = '✓';
    if (status.conclusion === 'failure') statusEmoji = '✗';

    const statusText = `
${statusEmoji} **Latest Workflow**

Status: ${status.status}
Conclusion: ${status.conclusion || 'In progress'}
Created: ${new Date(status.createdAt).toLocaleString()}

[View Run](${status.htmlUrl})
`;

    await ctx.reply(statusText, { parse_mode: 'Markdown' });
  } catch (error) {
    logger.error('Status check failed', { error: error.message });
    await ctx.reply(`❌ Failed to check status: ${sanitizeForTelegram(error.message)}`);
  }
}

/**
 * Handle unknown commands
 */
export async function handleUnknown(ctx) {
  await ctx.reply(
    '❓ Unknown command. Use /help to see available commands.',
    { parse_mode: 'Markdown' }
  );
}

export default {
  handleStart,
  handleHelp,
  handleTask,
  handleReviewPR,
  handleStatus,
  handleUnknown
};
