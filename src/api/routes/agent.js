/**
 * Agent execution API routes
 */

import { Router } from 'express';
import { getDatabase } from '../../database/db.js';
import logger from '../../utils/logger.js';
import { authenticate } from '../middleware/auth.js';

const db = getDatabase();

const router = Router();

/**
 * POST /api/agent/task
 * Trigger agent execution for a task
 */
router.post('/task', authenticate, async (req, res) => {
  try {
    const { sessionId, task, userId } = req.body;

    if (!task) {
      return res.status(400).json({ error: 'Task is required' });
    }

    if (!sessionId) {
      return res.status(400).json({ error: 'SessionId is required' });
    }

    // Verify session exists or create it
    let session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);

    if (!session) {
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO sessions (id, user_id, platform, created_at, last_activity)
        VALUES (?, ?, 'web', ?, ?)
      `).run(sessionId, userId || 'web_user', now, now);

      session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
    }

    logger.info('Agent task triggered', { sessionId, task: task.substring(0, 100) });

    // Execute agent asynchronously
    if (global.agentExecutor) {
      setImmediate(() => {
        global.agentExecutor(sessionId, task).catch(err => {
          logger.error('Agent execution failed', {
            sessionId,
            error: err.message
          });
        });
      });

      res.json({
        success: true,
        message: 'Agent execution started',
        sessionId
      });
    } else {
      res.status(503).json({
        error: 'Agent executor not available'
      });
    }
  } catch (error) {
    logger.error('Failed to trigger agent task', { error: error.message });
    res.status(500).json({ error: 'Failed to trigger agent task' });
  }
});

/**
 * GET /api/agent/status/:sessionId
 * Get current agent status for a session
 */
router.get('/status/:sessionId', authenticate, async (req, res) => {
  try {
    const { sessionId } = req.params;

    // Get latest agent run
    const latestRun = db.prepare(`
      SELECT * FROM agent_runs
      WHERE session_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(sessionId);

    if (!latestRun) {
      return res.json({
        success: true,
        status: 'idle',
        currentPhase: null,
        agentRun: null
      });
    }

    // Determine status based on agent run
    let status = 'idle';
    if (latestRun.status === 'running') {
      status = 'running';
    } else if (latestRun.status === 'failed') {
      status = 'error';
    } else if (latestRun.status === 'success') {
      status = 'completed';
    }

    res.json({
      success: true,
      status,
      currentPhase: latestRun.phase,
      agentRun: latestRun
    });
  } catch (error) {
    logger.error('Failed to get agent status', {
      sessionId: req.params.sessionId,
      error: error.message
    });
    res.status(500).json({ error: 'Failed to get agent status' });
  }
});

/**
 * GET /api/agent/runs/:sessionId
 * Get all agent runs for a session
 */
router.get('/runs/:sessionId', authenticate, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    const runs = db.prepare(`
      SELECT * FROM agent_runs
      WHERE session_id = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(sessionId, limit, offset);

    const total = db.prepare(`
      SELECT COUNT(*) as count FROM agent_runs WHERE session_id = ?
    `).get(sessionId);

    res.json({
      success: true,
      runs,
      pagination: {
        total: total.count,
        limit,
        offset,
        hasMore: offset + limit < total.count
      }
    });
  } catch (error) {
    logger.error('Failed to get agent runs', {
      sessionId: req.params.sessionId,
      error: error.message
    });
    res.status(500).json({ error: 'Failed to get agent runs' });
  }
});

/**
 * GET /api/agent/runs/:sessionId/:runId
 * Get detailed information about a specific agent run
 */
router.get('/runs/:sessionId/:runId', authenticate, async (req, res) => {
  try {
    const { sessionId, runId } = req.params;

    const run = db.prepare(`
      SELECT * FROM agent_runs
      WHERE id = ? AND session_id = ?
    `).get(runId, sessionId);

    if (!run) {
      return res.status(404).json({ error: 'Agent run not found' });
    }

    res.json({
      success: true,
      run
    });
  } catch (error) {
    logger.error('Failed to get agent run', {
      runId: req.params.runId,
      error: error.message
    });
    res.status(500).json({ error: 'Failed to get agent run' });
  }
});

export default router;
