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

export default {
  initBot,
  startBot
};
