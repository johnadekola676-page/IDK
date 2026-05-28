/**
 * API routes aggregator
 */

import { Router } from 'express';
import sessionsRouter from './sessions.js';
import messagesRouter from './messages.js';
import agentRouter from './agent.js';
import filesRouter from './files.js';

const router = Router();

// Health check
router.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Mount route modules
router.use('/sessions', sessionsRouter);
router.use('/messages', messagesRouter);
router.use('/agent', agentRouter);
router.use('/files', filesRouter);

export default router;
