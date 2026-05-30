/**
 * Agent execution API routes
 */

import { Router } from 'express';
import { getDatabase } from '../../database/db.js';
import { getOrCreateSession } from '../../database/queries.js';
import { executeAgentLoop } from '../../agent/loop.js';
import logger from '../../utils/logger.js';
import { authenticate } from '../middleware/auth.js';

const db = getDatabase();

const router = Router();

/**
 * POST /api/agent/task
 * Trigger agent execution for a task (Web/API endpoint)
 */
router.post('/task', authenticate, async (req, res) => {
  try {
    const { task, sessionId, userId } = req.body;

    if (!task) {
      return res.status(400).json({ error: 'Task is required' });
    }

    // Get or create session atomically
    const actualSessionId = sessionId || getOrCreateSession(
      String(userId || req.user?.id || 'api_user'),
      'api'
    );

    logger.info('Agent task triggered via API', {
      sessionId: actualSessionId,
      userId,
      task: task.substring(0, 100)
    });

    // Execute agent loop asynchronously
    setImmediate(() => {
      executeAgentLoop(task, actualSessionId, null, userId).catch(err => {
        logger.error('Agent execution failed', {
          sessionId: actualSessionId,
          error: err.message
        });
      });
    });

    res.json({
      success: true,
      message: 'Agent execution started',
      sessionId: actualSessionId,
      taskId: actualSessionId
    });

  } catch (error) {
    logger.error('Failed to trigger agent task', { error: error.message });
    res.status(500).json({ error: 'Failed to trigger agent task' });
  }
});

/**
 * GET /api/agent/status/:sessionId
 * Get current agent status for a session with recent messages
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

    // Get recent messages
    const messages = db.prepare(`
      SELECT role, content, timestamp
      FROM messages
      WHERE session_id = ?
      ORDER BY timestamp DESC
      LIMIT 10
    `).all(sessionId);

    if (!latestRun) {
      return res.json({
        success: true,
        status: 'idle',
        currentPhase: null,
        agentRun: null,
        messages: messages.reverse()
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
      agentRun: latestRun,
      messages: messages.reverse()
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

/**
 * POST /api/agent/cli-task
 * CLI-friendly task submission (no auth required for localhost)
 * Used by max-cli.js for direct task execution
 */
router.post('/cli-task', async (req, res) => {
  try {
    const { task, userId = 'cli_user' } = req.body;

    if (!task) {
      return res.status(400).json({ error: 'Task is required' });
    }

    // Get or create session atomically - FIXED: Use getOrCreateSession
    const sessionId = getOrCreateSession(String(userId), 'cli');

    logger.info('CLI task submitted', {
      sessionId,
      userId,
      task: task.substring(0, 100)
    });

    // Execute agent loop asynchronously
    setImmediate(() => {
      executeAgentLoop(task, sessionId, null, userId).catch(err => {
        logger.error('CLI agent execution failed', {
          sessionId,
          error: err.message
        });
      });
    });

    res.json({
      success: true,
      message: 'Task started. Use max-cli subscribe to watch progress.',
      sessionId,
      taskId: sessionId
    });

  } catch (error) {
    logger.error('Failed to submit CLI task', { error: error.message });
    res.status(500).json({ error: 'Failed to submit CLI task' });
  }
});

export default router;
