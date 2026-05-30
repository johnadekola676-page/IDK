/**
 * Session management API routes
 */

import { Router } from 'express';
import { getDatabase } from '../../database/db.js';
import logger from '../../utils/logger.js';
import { authenticate } from '../middleware/auth.js';

const db = getDatabase();

const router = Router();

/**
 * GET /api/sessions
 * List all sessions
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    const sessions = db.prepare(`
      SELECT
        s.id,
        s.user_id,
        s.platform,
        s.created_at,
        s.last_activity,
        COUNT(DISTINCT m.id) as message_count,
        COUNT(DISTINCT ar.id) as agent_run_count
      FROM sessions s
      LEFT JOIN messages m ON s.id = m.session_id
      LEFT JOIN agent_runs ar ON s.id = ar.session_id
      GROUP BY s.id
      ORDER BY s.last_activity DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset);

    const total = db.prepare('SELECT COUNT(*) as count FROM sessions').get();

    res.json({
      success: true,
      sessions,
      pagination: {
        total: total.count,
        limit,
        offset,
        hasMore: offset + limit < total.count
      }
    });
  } catch (error) {
    logger.error('Failed to list sessions', { error: error.message });
    res.status(500).json({ error: 'Failed to list sessions' });
  }
});

/**
 * GET /api/sessions/:id
 * Get session details including messages and agent runs
 */
router.get('/:id', authenticate, async (req, res) => {
  try {
    const sessionId = req.params.id;

    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const messages = db.prepare(`
      SELECT * FROM messages
      WHERE session_id = ?
      ORDER BY timestamp ASC
    `).all(sessionId);

    const agentRuns = db.prepare(`
      SELECT * FROM agent_runs
      WHERE session_id = ?
      ORDER BY created_at ASC
    `).all(sessionId);

    const context = db.prepare(`
      SELECT * FROM session_context
      WHERE session_id = ?
    `).get(sessionId);

    res.json({
      success: true,
      session: {
        ...session,
        messages,
        agentRuns,
        context: context ? JSON.parse(context.context_data) : {}
      }
    });
  } catch (error) {
    logger.error('Failed to get session', { sessionId: req.params.id, error: error.message });
    res.status(500).json({ error: 'Failed to get session' });
  }
});

/**
 * POST /api/sessions
 * Create a new session
 */
router.post('/', authenticate, async (req, res) => {
  try {
    const { userId, platform = 'web' } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const sessionId = `web_${Date.now()}_${userId}`;
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO sessions (id, user_id, platform, created_at, last_activity)
      VALUES (?, ?, ?, ?, ?)
    `).run(sessionId, userId, platform, now, now);

    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);

    logger.info('Created new session', { sessionId, userId, platform });

    res.status(201).json({
      success: true,
      session: {
        ...session,
        messages: [],
        agentRuns: [],
        context: {}
      }
    });
  } catch (error) {
    logger.error('Failed to create session', { error: error.message });
    res.status(500).json({ error: 'Failed to create session' });
  }
});

/**
 * GET /api/sessions/:sessionId/messages
 * Get messages with optional since parameter
 */
router.get('/:sessionId/messages', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { since } = req.query;

    const db = getDatabase();

    let stmt;
    if (since) {
      stmt = db.prepare(`
        SELECT * FROM messages
        WHERE session_id = ? AND id > ?
        ORDER BY created_at ASC
      `);
      const messages = stmt.all(sessionId, parseInt(since));
      res.json(messages);
    } else {
      stmt = db.prepare(`
        SELECT * FROM messages
        WHERE session_id = ?
        ORDER BY created_at ASC
      `);
      const messages = stmt.all(sessionId);
      res.json(messages);
    }
  } catch (error) {
    logger.error('Failed to fetch messages', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

/**
 * DELETE /api/sessions/:id
 * Delete a session and all related data
 */
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const sessionId = req.params.id;

    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Delete in order to respect foreign key constraints
    db.prepare('DELETE FROM messages WHERE session_id = ?').run(sessionId);
    db.prepare('DELETE FROM agent_runs WHERE session_id = ?').run(sessionId);
    db.prepare('DELETE FROM session_context WHERE session_id = ?').run(sessionId);
    db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);

    logger.info('Deleted session', { sessionId });

    res.json({ success: true, message: 'Session deleted' });
  } catch (error) {
    logger.error('Failed to delete session', { sessionId: req.params.id, error: error.message });
    res.status(500).json({ error: 'Failed to delete session' });
  }
});

export default router;
