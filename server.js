import 'dotenv/config';
import http from 'http';
import { initDatabase, pruneSessions } from './src/database/db.js';
import { initBot, startBot } from './src/bot/telegram.js';
import { ensureSandbox } from './src/utils/filesystem.js';
import { validateEnvironment } from './src/security/sandbox.js';
import logger from './src/utils/logger.js';

const PORT = process.env.PORT || 3000;

/**
 * Initialize application
 */
async function initialize() {
  logger.info('Starting Autonomous CI/CD Agent');
  logger.info('Environment', {
    nodeEnv: process.env.NODE_ENV,
    port: PORT
  });

  // Validate environment
  logger.info('Validating environment');
  const envValidation = validateEnvironment();

  if (!envValidation.valid) {
    logger.error('Environment validation failed', { errors: envValidation.errors });
    throw new Error(`Environment validation failed: ${envValidation.errors.join(', ')}`);
  }

  logger.info('Environment validation passed');

  // Initialize database
  logger.info('Initializing database');
  initDatabase();

  // Ensure sandbox workspace exists
  logger.info('Setting up sandbox workspace');
  await ensureSandbox();

  // Prune old sessions
  const pruneDays = parseInt(process.env.SESSION_PRUNE_DAYS || '30', 10);
  logger.info('Pruning old sessions', { days: pruneDays });
  pruneSessions(pruneDays);

  // Initialize Telegram bot
  logger.info('Initializing Telegram bot');
  const bot = initBot();

  // Start bot
  await startBot(bot);

  return bot;
}

/**
 * Create health check HTTP server
 */
function createHealthServer() {
  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      }));
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    }
  });

  server.listen(PORT, () => {
    logger.info(`Health check server listening on port ${PORT}`);
  });

  return server;
}

/**
 * Main application entry point
 */
async function main() {
  try {
    // Initialize application
    await initialize();

    // Create health check server (required for Railway)
    const healthServer = createHealthServer();

    // Setup scheduled tasks
    setupScheduledTasks();

    logger.info('Application started successfully');
  } catch (error) {
    logger.error('Failed to start application', {
      error: error.message,
      stack: error.stack
    });
    process.exit(1);
  }
}

/**
 * Setup scheduled tasks
 */
function setupScheduledTasks() {
  // Prune old sessions daily
  const pruneDays = parseInt(process.env.SESSION_PRUNE_DAYS || '30', 10);

  setInterval(() => {
    logger.info('Running scheduled session pruning');
    try {
      pruneSessions(pruneDays);
    } catch (error) {
      logger.error('Scheduled pruning failed', { error: error.message });
    }
  }, 24 * 60 * 60 * 1000); // Once per day
}

/**
 * Graceful shutdown
 */
async function shutdown(signal) {
  logger.info(`Received ${signal}, shutting down gracefully`);

  try {
    // Close database
    const { getDatabase } = await import('./src/database/db.js');
    const db = getDatabase();
    if (db) {
      db.close();
      logger.info('Database closed');
    }
  } catch (error) {
    logger.error('Error during shutdown', { error: error.message });
  }

  process.exit(0);
}

// Handle shutdown signals
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', {
    error: error.message,
    stack: error.stack
  });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', {
    reason: reason instanceof Error ? reason.message : reason,
    promise
  });
  process.exit(1);
});

// Start application
main();
