import { Telegraf } from 'telegraf';
import { authMiddleware, errorMiddleware, loggingMiddleware } from './middleware.js';
import {
  handleStart,
  handleHelp,
  handleTask,
  handleReviewPR,
  handleStatus,
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

  logger.info('Initializing Telegram bot');

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

  // Handle unknown commands
  bot.on('message', handleUnknown);

  // Error handling
  bot.catch(errorMiddleware);

  logger.info('Telegram bot initialized');

  return bot;
}

/**
 * Start bot
 * @param {Telegraf} bot - Bot instance
 */
export async function startBot(bot) {
  try {
    logger.info('Starting Telegram bot');

    // Enable graceful stop
    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));

    // Start polling
    await bot.launch();

    logger.info('Telegram bot started successfully');
  } catch (error) {
    logger.error('Failed to start bot', { error: error.message });
    throw error;
  }
}

export default {
  initBot,
  startBot
};
