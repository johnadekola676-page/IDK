import { Telegraf } from 'telegraf';
import { authMiddleware, errorMiddleware, loggingMiddleware } from './middleware.js';
import {
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
  handlePR,
  handleDeploy,
  handleRollback,
  handleLogs,
  handleFix,
  handleDocs,
  handleUnknown
} from './commands.js';
import logger from '../utils/logger.js';

/**
 * Initialize Telegram bot
 * @returns {Telegraf} Bot instance
 */
export function initBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    throw new Error('TELEGRAM_BOT_TOKEN environment variable is required');
  }

  // Telemetry logging for token verification
  console.log('Token check:', token?.substring(0, 5) + '...', 'Length:', token?.length);
  logger.info('Initializing Telegram bot', {
    tokenPrefix: token?.substring(0, 5),
    tokenLength: token?.length
  });

  const bot = new Telegraf(token);

  // Apply middleware
  bot.use(loggingMiddleware);
  bot.use(authMiddleware);

  // Register commands
  bot.command('start', handleStart);
  bot.command('help', handleHelp);
  bot.command('task', handleTask);
  bot.command('review_pr', handleReviewPR);
  bot.command('reviewpr', handleReviewPR); // Alias without underscore
  bot.command('status', handleStatus);

  // Repository commands
  bot.command('setrepo', handleSetRepo);
  bot.command('repos', handleRepos);

  // Quick actions
  bot.command('commit', handleCommit);
  bot.command('test', handleTest);
  bot.command('build', handleBuild);

  // Advanced commands
  bot.command('pr', handlePR);
  bot.command('deploy', handleDeploy);
  bot.command('rollback', handleRollback);
  bot.command('logs', handleLogs);
  bot.command('fix', handleFix);
  bot.command('docs', handleDocs);

  // Handle unknown commands
  bot.on('message', handleUnknown);

  // Error handling
  bot.catch(errorMiddleware);

  logger.info('Telegram bot initialized');

  return bot;
}

/**
 * Start bot with non-blocking error handling
 * @param {Telegraf} bot - Bot instance
 * @param {Object} options - Optional configuration
 * @param {Function} options.onFailure - Callback for handling failures
 * @param {number} options.retryDelay - Delay in milliseconds before attempting launch
 * @returns {Promise<{success: boolean, error?: Error, code?: number, retryable?: boolean}>}
 */
export async function startBot(bot, options = {}) {
  const { onFailure, retryDelay = 0 } = options;

  try {
    // Wait for retry delay if specified
    if (retryDelay > 0) {
      logger.info('Waiting before bot launch attempt', { retryDelay });
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }

    logger.info('Starting Telegram bot');

    // Enable graceful stop
    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));

    // Start polling
    await bot.launch();

    logger.info('Telegram bot started successfully');
    return { success: true };
  } catch (error) {
    // Check for 409 Conflict error (another instance running)
    const errorCode = error.response?.error_code;
    const is409Conflict = errorCode === 409;
    const retryable = is409Conflict || errorCode === 429 || errorCode >= 500;

    // Log as warning (non-fatal) instead of error
    logger.warn('Failed to start bot', {
      error: error.message,
      code: errorCode,
      retryable,
      description: error.response?.description
    });

    // Output structured diagnostic data
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      event: 'bot_start_failure',
      error: error.message,
      code: errorCode,
      retryable,
      stack: error.stack
    }, null, 2));

    // Call failure callback if provided
    if (onFailure) {
      onFailure(error);
    }

    // Return failure result instead of throwing
    return {
      success: false,
      error,
      code: errorCode,
      retryable
    };
  }
}

/**
 * Start bot in webhook mode
 * @param {Telegraf} bot - Telegraf bot instance
 * @param {Object} options - Webhook options
 * @param {string} options.webhookUrl - Full webhook URL (e.g., https://domain.com/api/telegram/webhook)
 * @param {string} options.path - Webhook path (default: /api/telegram/webhook)
 * @param {number} options.port - Port for webhook server (default: process.env.PORT)
 * @returns {Promise<Object>} Result object with success status
 */
export async function startBotWebhook(bot, options = {}) {
  try {
    const {
      webhookUrl = process.env.TELEGRAM_WEBHOOK_URL,
      path = '/api/telegram/webhook',
      port = process.env.PORT || 3000
    } = options;

    if (!webhookUrl) {
      throw new Error('TELEGRAM_WEBHOOK_URL is required for webhook mode');
    }

    logger.info('Starting Telegram bot in webhook mode', {
      webhookUrl,
      path,
      port
    });

    // Set webhook
    await bot.telegram.setWebhook(webhookUrl);

    logger.info('Webhook set successfully', { webhookUrl });

    return { success: true, mode: 'webhook' };
  } catch (error) {
    logger.error('Failed to set webhook', {
      error: error.message,
      webhookUrl: options.webhookUrl
    });

    return { success: false, error: error.message, mode: 'webhook' };
  }
}

export default {
  initBot,
  startBot,
  startBotWebhook
};
