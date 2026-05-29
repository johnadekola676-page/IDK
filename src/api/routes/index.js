/**
 * API routes aggregator
 */

import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import sessionsRouter from './sessions.js';
import messagesRouter from './messages.js';
import agentRouter from './agent.js';
import filesRouter from './files.js';
import maxRouter from './max.js';

const router = Router();

// Health check
router.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    telegram: global.botStatus || 'unknown'
  });
});

// Debug route to check frontend dist
router.get('/debug/frontend', (req, res) => {
  const distPath = path.join(process.cwd(), 'frontend', 'dist');
  const distExists = fs.existsSync(distPath);
  const indexExists = distExists && fs.existsSync(path.join(distPath, 'index.html'));

  res.json({
    distPath,
    distExists,
    indexExists,
    cwd: process.cwd(),
    files: distExists ? fs.readdirSync(distPath) : []
  });
});

// Mount route modules
router.use('/sessions', sessionsRouter);
router.use('/messages', messagesRouter);
router.use('/agent', agentRouter);
router.use('/files', filesRouter);
router.use('/max', maxRouter);

export default router;
