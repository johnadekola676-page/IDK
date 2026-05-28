import 'dotenv/config';
import http from 'http';
import express from 'express';
import cors from 'cors';
import { Server as SocketIO } from 'socket.io';
import { initDatabase, pruneSessions } from './src/database/db.js';
import { migrateToV2, needsMigration } from './src/database/migrate-v2.js';
import { initBot, startBot } from './src/bot/telegram.js';
import { ensureSandbox } from './src/utils/filesystem.js';
import { validateEnvironment } from './src/security/sandbox.js';
import logger from './src/utils/logger.js';
import apiRoutes from './src/api/routes/index.js';
import { initWebSocket } from './src/api/websocket.js';
import { executeAgentLoop } from './src/agent/loop.js';
import { addMessage } from './src/database/queries.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
    // Log detailed error before throwing
    console.error('\n');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('[FATAL] APPLICATION STARTUP FAILED');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('Missing required environment variables:');
    envValidation.errors.forEach((err, idx) => {
      console.error(`  ${idx + 1}. ${err}`);
    });
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('\n');

    logger.error('Environment validation failed', { errors: envValidation.errors });
    throw new Error(`Environment validation failed: ${envValidation.errors.join(', ')}`);
  }

  logger.info('Environment validation passed');

  // Initialize database
  logger.info('Initializing database');
  initDatabase();

  // Run V2 migration if needed
  if (needsMigration()) {
    logger.info('Running V2 database migration');
    migrateToV2();
  } else {
    logger.info('V2 database schema already up to date');
  }

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
 * Create Express app with API routes and WebSocket support
 */
function createExpressApp() {
  const app = express();
  const server = http.createServer(app);
  const io = new SocketIO(server, {
    cors: {
      origin: process.env.WEB_UI_ORIGIN || '*',
      methods: ['GET', 'POST']
    }
  });

  // Middleware
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Request logging
  app.use((req, res, next) => {
    logger.debug('HTTP request', {
      method: req.method,
      path: req.path,
      ip: req.ip
    });
    next();
  });

  // API routes
  app.use('/api', apiRoutes);

  // Serve frontend static files
  const frontendPath = path.join(__dirname, 'frontend', 'dist');
  app.use(express.static(frontendPath));

  // Serve index.html for all non-API routes (SPA routing)
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) {
      return next();
    }
    res.sendFile(path.join(frontendPath, 'index.html'), (err) => {
      if (err) {
        logger.debug('Frontend not built, serving API only');
        res.status(404).json({ error: 'Frontend not available' });
      }
    });
  });

  // Initialize WebSocket server
  initWebSocket(io);

  // Setup global agent executor for web UI
  global.agentExecutor = async (sessionId, task) => {
    try {
      logger.info('Executing agent task from web UI', { sessionId, task: task.substring(0, 100) });

      // Add assistant message indicating start
      await addMessage(sessionId, 'assistant', 'Starting agent execution...');

      // Execute agent loop
      const results = await executeAgentLoop(task, sessionId, null, 'web_user');

      // Add result message
      const resultMessage = results.success
        ? '✅ Task completed successfully!'
        : '❌ Task failed. Check logs for details.';
      await addMessage(sessionId, 'assistant', resultMessage);

      return results;
    } catch (error) {
      logger.error('Agent executor error', { sessionId, error: error.message });
      await addMessage(sessionId, 'assistant', `Error: ${error.message}`);
      throw error;
    }
  };

  // Start server
  server.listen(PORT, '0.0.0.0', () => {
    logger.info(`Server listening on port ${PORT}`);
    logger.info(`Web UI: http://0.0.0.0:${PORT}`);
    logger.info(`API: http://0.0.0.0:${PORT}/api`);
  });

  return { app, server, io };
}

/**
 * Main application entry point
 */
async function main() {
  try {
    // Initialize application (database, Telegram bot)
    await initialize();

    // Create Express app with API and WebSocket support
    const { app, server, io } = createExpressApp();

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
