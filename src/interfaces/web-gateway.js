/**
 * Web Gateway (MODE A)
 * Optimized for remote cloud hosting (Railway)
 * Communicates via Telegram polling/webhooks
 * Sandboxes file execution inside cloud container volumes
 */

import http from 'http';
import express from 'express';
import cors from 'cors';
import { Server as SocketIO } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDatabase, pruneSessions } from '../database/db.js';
import { migrateToV2, needsMigration } from '../database/migrate-v2.js';
import { initBot, startBot } from '../bot/telegram.js';
import { ensureSandbox } from '../utils/filesystem.js';
import { validateEnvironment } from '../security/sandbox.js';
import logger from '../utils/logger.js';
import apiRoutes from '../api/routes/index.js';
import { initWebSocket } from '../api/websocket.js';
import { executeAgentLoop } from '../agent/loop.js';
import { addMessage } from '../database/queries.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class WebGateway {
  constructor() {
    this.port = process.env.PORT || 3000;
    this.app = null;
    this.server = null;
    this.io = null;
  }

  /**
   * Initialize web gateway
   */
  async initialize() {
    logger.info('🌐 Initializing WEB GATEWAY', {
      port: this.port,
      nodeEnv: process.env.NODE_ENV
    });

    // Validate environment
    const envValidation = validateEnvironment();
    if (!envValidation.valid) {
      this.logFatalError(envValidation.errors);
      throw new Error('Environment validation failed');
    }

    // Initialize database
    logger.info('Initializing database');
    initDatabase();

    // Check for V2 migration
    if (needsMigration()) {
      logger.info('Running V2 migration');
      migrateToV2();
    }

    // Prune old sessions
    pruneSessions();

    // Ensure sandbox exists
    await ensureSandbox();

    // Create Express app
    this.createExpressApp();

    // Initialize Telegram bot
    logger.info('Initializing Telegram bot');
    const bot = initBot();

    // Start server
    await this.startServer();

    // Start Telegram bot
    logger.info('Starting Telegram bot');
    await startBot(bot);

    logger.info('✅ Web Gateway ready');
  }

  /**
   * Create Express application with WebSocket support
   */
  createExpressApp() {
    this.app = express();
    this.server = http.createServer(this.app);
    this.io = new SocketIO(this.server, {
      cors: {
        origin: process.env.WEB_UI_ORIGIN || '*',
        methods: ['GET', 'POST']
      }
    });

    // Middleware
    this.app.use(cors());
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // API routes
    this.app.use('/api', apiRoutes);

    // Serve frontend static files
    const frontendDistPath = path.join(path.dirname(__dirname), '..', 'frontend', 'dist');
    this.app.use(express.static(frontendDistPath));

    // SPA fallback
    this.app.get(/.*/, (req, res) => {
      res.sendFile(path.join(frontendDistPath, 'index.html'));
    });

    // Initialize WebSocket
    initWebSocket(this.io);

    // Make agent executor available globally for API
    global.agentExecutor = async (sessionId, task) => {
      logger.info('Executing agent task via API', { sessionId, task: task.substring(0, 50) });

      // Add user message to database
      await addMessage(sessionId, 'user', task);

      // Execute agent loop
      const results = await executeAgentLoop(task, sessionId, null, 'web_user');

      return results;
    };

    logger.info('Express app created with WebSocket support');
  }

  /**
   * Start HTTP server
   */
  async startServer() {
    return new Promise((resolve, reject) => {
      // Bind to 0.0.0.0 for Railway compatibility (allows external access)
      const host = process.env.HOST || '0.0.0.0';

      this.server.listen(this.port, host, () => {
        logger.info('🚀 Web Gateway listening', {
          host,
          port: this.port,
          webUI: `http://${host}:${this.port}`,
          api: `http://${host}:${this.port}/api`
        });
        resolve();
      });

      this.server.on('error', (error) => {
        logger.error('Server error', { error: error.message });
        reject(error);
      });
    });
  }

  /**
   * Log fatal error with formatting
   */
  logFatalError(errors) {
    console.error('\n');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('[FATAL] WEB GATEWAY STARTUP FAILED');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('Missing required environment variables:');
    errors.forEach((err, idx) => {
      console.error(`  ${idx + 1}. ${err}`);
    });
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('\n');
  }

  /**
   * Shutdown gracefully
   */
  async shutdown() {
    logger.info('Shutting down Web Gateway');

    if (this.server) {
      await new Promise((resolve) => {
        this.server.close(resolve);
      });
    }

    if (this.io) {
      this.io.close();
    }

    logger.info('✅ Web Gateway shut down');
  }
}

export default WebGateway;
