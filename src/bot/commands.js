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
🤖 <b>MAX - Multi-Agent eXecutor System</b>
<i>Autonomous CI/CD Developer Agent</i>

Welcome! I'm your autonomous development assistant. I can:

• Execute development tasks with 5-phase self-healing
• Review pull requests for security & quality
• Monitor GitHub Actions workflows
• Automatically fix errors and retry

<b>Commands:</b>
/start - Show this message
/task &lt;description&gt; - Execute a development task
/review_pr &lt;number&gt; - Review a pull request
/status - Check workflow status
/help - Detailed help

<b>Example:</b>
/task Create a REST API endpoint for user authentication

Let's build something amazing! 🚀
`;

  await ctx.reply(welcomeMessage, { parse_mode: 'HTML' });
}

/**
 * Handle /help command
 */
export async function handleHelp(ctx) {
  const helpMessage = `
📚 <b>MAX - Command Reference</b>
<i>Multi-Agent eXecutor System</i>

<b>🔧 Main Commands:</b>

<b>/task &lt;description&gt;</b>
Execute autonomous development tasks
Example: /task Create a REST API endpoint

<b>/review_pr &lt;number&gt;</b>
Review a pull request
Example: /review_pr 42

<b>/status</b>
Check GitHub Actions workflow status

<b>📁 Repository Commands:</b>

<b>/setrepo owner/repo</b>
Set active repository
Example: /setrepo johnadekola676-page/IDK

<b>/repos</b>
List configured repositories

<b>⚡ Quick Actions:</b>

<b>/commit &lt;message&gt;</b>
Quick commit all changes
Example: /commit Add new feature

<b>/test</b>
Run all tests

<b>/build</b>
Build the project

<b>💡 Features:</b>
✓ 5-phase autonomous execution
✓ Self-healing (10 retry attempts)
✓ Code review before commit
✓ Real-time progress updates
✓ Multi-repository support

Need help? Just ask!
`;

  await ctx.reply(helpMessage, { parse_mode: 'HTML' });
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

      let text = `${emoji} <b>Phase: ${phase.toUpperCase()}</b> - ${status}`;

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
            { parse_mode: 'HTML' }
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
    await ctx.reply(formatMessage(formattedResults), { parse_mode: 'HTML' });

    // Send detailed error if failed
    if (!results.success) {
      let errorDetails = '<b>Error Details:</b>\n\n';

      if (results.test && !results.test.success && !results.test.skipped) {
        errorDetails += `Test failed:\n<pre>${results.test.stderr?.substring(0, 500) || 'Unknown error'}</pre>`;
      } else if (results.error) {
        errorDetails += `<pre>${results.error.substring(0, 500)}</pre>`;
      }

      await ctx.reply(sanitizeForTelegram(errorDetails), { parse_mode: 'HTML' });
    }

    // Send workflow link if available
    if (results.monitor && results.monitor.workflow) {
      await ctx.reply(
        `🔗 <a href="${results.monitor.workflow.htmlUrl}">View workflow run</a>`,
        { parse_mode: 'HTML' }
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
    await ctx.reply(formattedReview, { parse_mode: 'HTML' });

    // Send risk alert if critical
    if (reviewResult.review.risk_level === 'critical') {
      await ctx.reply(
        '🚨 <b>CRITICAL RISK DETECTED</b>\n\nThis PR contains critical security issues. Do NOT merge until issues are resolved.',
        { parse_mode: 'HTML' }
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
${statusEmoji} <b>Latest Workflow</b>

Status: ${status.status}
Conclusion: ${status.conclusion || 'In progress'}
Created: ${new Date(status.createdAt).toLocaleString()}

<a href="${status.htmlUrl}">View Run</a>
`;

    await ctx.reply(statusText, { parse_mode: 'HTML' });
  } catch (error) {
    logger.error('Status check failed', { error: error.message });
    await ctx.reply(`❌ Failed to check status: ${sanitizeForTelegram(error.message)}`);
  }
}

/**
 * Handle /setrepo command
 * Set the active GitHub repository for this user
 */
export async function handleSetRepo(ctx) {
  const args = ctx.message.text.replace('/setrepo', '').trim();

  if (!args || !args.includes('/')) {
    await ctx.reply(
      '📁 <b>Set Repository</b>\n\n' +
      'Usage: /setrepo owner/repo\n\n' +
      'Example: /setrepo johnadekola676-page/IDK',
      { parse_mode: 'HTML' }
    );
    return;
  }

  const [owner, repo] = args.split('/');

  if (!owner || !repo) {
    await ctx.reply('❌ Invalid format. Use: /setrepo owner/repo');
    return;
  }

  try {
    const userId = ctx.from.id;

    // Store in session context
    const session = getActiveSession(userId) || createSession(userId);

    // Save repo selection
    db.prepare(`
      INSERT OR REPLACE INTO session_context (session_id, context_data)
      VALUES (?, ?)
    `).run(session.id, JSON.stringify({ repository: { owner, repo } }));

    logger.info('Repository set for user', { userId, owner, repo });

    await ctx.reply(
      `✅ Repository set to: <b>${owner}/${repo}</b>\n\n` +
      'All future tasks will use this repository.',
      { parse_mode: 'HTML' }
    );
  } catch (error) {
    logger.error('Failed to set repository', { error: error.message });
    await ctx.reply('❌ Failed to set repository. Please try again.');
  }
}

/**
 * Handle /repos command
 * List available repositories
 */
export async function handleRepos(ctx) {
  try {
    await ctx.reply(
      '📁 <b>Repository Management</b>\n\n' +
      'To set your active repository:\n' +
      '/setrepo owner/repo\n\n' +
      'Example:\n' +
      '/setrepo johnadekola676-page/IDK\n\n' +
      'Currently configured:\n' +
      `• GITHUB_OWNER: ${process.env.GITHUB_OWNER || 'not set'}\n` +
      `• GITHUB_REPO: ${process.env.GITHUB_REPO || 'not set'}`,
      { parse_mode: 'HTML' }
    );
  } catch (error) {
    logger.error('Failed to list repos', { error: error.message });
    await ctx.reply('❌ Failed to list repositories.');
  }
}

/**
 * Handle /commit command
 * Quick commit with message
 */
export async function handleCommit(ctx) {
  const message = ctx.message.text.replace('/commit', '').trim();

  if (!message) {
    await ctx.reply(
      '💾 <b>Quick Commit</b>\n\n' +
      'Usage: /commit Your commit message\n\n' +
      'Example: /commit Add new feature',
      { parse_mode: 'HTML' }
    );
    return;
  }

  try {
    const userId = ctx.from.id;
    const session = getActiveSession(userId) || createSession(userId);

    await ctx.reply('⏳ Creating commit...');

    // Trigger a commit task
    await executeAgentLoop(
      userId,
      `Commit all changes with message: "${message}"`,
      { sessionId: session.id }
    );

    await ctx.reply('✅ Commit created and pushed!', { parse_mode: 'HTML' });
  } catch (error) {
    logger.error('Commit failed', { error: error.message });
    await ctx.reply(`❌ Commit failed: ${error.message}`);
  }
}

/**
 * Handle /test command
 * Run tests
 */
export async function handleTest(ctx) {
  try {
    const userId = ctx.from.id;
    const session = getActiveSession(userId) || createSession(userId);

    await ctx.reply('🧪 Running tests...');

    await executeAgentLoop(
      userId,
      'Run all tests and report results',
      { sessionId: session.id }
    );

    await ctx.reply('✅ Tests completed!');
  } catch (error) {
    logger.error('Test failed', { error: error.message });
    await ctx.reply(`❌ Tests failed: ${error.message}`);
  }
}

/**
 * Handle /build command
 * Build the project
 */
export async function handleBuild(ctx) {
  try {
    const userId = ctx.from.id;
    const session = getActiveSession(userId) || createSession(userId);

    await ctx.reply('🔨 Building project...');

    await executeAgentLoop(
      userId,
      'Build the project and report any errors',
      { sessionId: session.id }
    );

    await ctx.reply('✅ Build completed!');
  } catch (error) {
    logger.error('Build failed', { error: error.message });
    await ctx.reply(`❌ Build failed: ${error.message}`);
  }
}

/**
 * Handle unknown commands
 */
export async function handleUnknown(ctx) {
  await ctx.reply(
    '❓ Unknown command. Use /help to see available commands.',
    { parse_mode: 'HTML' }
  );
}

export default {
  handleStart,
  handleHelp,
  handleTask,
  handleReviewPR,
  handleStatus,
  handleSetRepo,
  handleRepos,
  handleCommit,
  handleTest,
  handleBuild,
  handleUnknown
};
