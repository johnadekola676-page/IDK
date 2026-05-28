import { getDatabase } from './db.js';
import logger from '../utils/logger.js';

/**
 * Create a new session for a user
 * @param {number} userId - Telegram user ID
 * @returns {number} Session ID
 */
export function createSession(userId) {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO sessions (user_id, status)
      VALUES (?, 'active')
    `);
    const result = stmt.run(userId);
    logger.info(`Created session ${result.lastInsertRowid} for user ${userId}`);
    return result.lastInsertRowid;
  } catch (error) {
    logger.error('Failed to create session', { userId, error: error.message });
    throw error;
  }
}

/**
 * Get active session for a user
 * @param {number} userId - Telegram user ID
 * @returns {Object|null} Session object or null
 */
export function getActiveSession(userId) {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT * FROM sessions
      WHERE user_id = ? AND status = 'active'
      ORDER BY created_at DESC
      LIMIT 1
    `);
    return stmt.get(userId);
  } catch (error) {
    logger.error('Failed to get active session', { userId, error: error.message });
    throw error;
  }
}

/**
 * Update session last activity timestamp
 * @param {number} sessionId - Session ID
 */
export function updateSessionActivity(sessionId) {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      UPDATE sessions
      SET last_activity = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    stmt.run(sessionId);
  } catch (error) {
    logger.error('Failed to update session activity', { sessionId, error: error.message });
    throw error;
  }
}

/**
 * Close a session
 * @param {number} sessionId - Session ID
 */
export function closeSession(sessionId) {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      UPDATE sessions
      SET status = 'inactive'
      WHERE id = ?
    `);
    stmt.run(sessionId);
    logger.info(`Closed session ${sessionId}`);
  } catch (error) {
    logger.error('Failed to close session', { sessionId, error: error.message });
    throw error;
  }
}

/**
 * Add a message to the session
 * @param {number} sessionId - Session ID
 * @param {string} role - Message role (user, assistant, system)
 * @param {string} content - Message content
 * @returns {number} Message ID
 */
export function addMessage(sessionId, role, content) {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO messages (session_id, role, content)
      VALUES (?, ?, ?)
    `);
    const result = stmt.run(sessionId, role, content);
    updateSessionActivity(sessionId);
    return result.lastInsertRowid;
  } catch (error) {
    logger.error('Failed to add message', { sessionId, role, error: error.message });
    throw error;
  }
}

/**
 * Get recent messages for a session
 * @param {number} sessionId - Session ID
 * @param {number} limit - Number of messages to retrieve
 * @returns {Array} Array of message objects
 */
export function getRecentMessages(sessionId, limit = 10) {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT role, content, timestamp
      FROM messages
      WHERE session_id = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);
    const messages = stmt.all(sessionId, limit);
    return messages.reverse(); // Return in chronological order
  } catch (error) {
    logger.error('Failed to get recent messages', { sessionId, error: error.message });
    throw error;
  }
}

/**
 * Create an agent run record
 * @param {number} sessionId - Session ID
 * @param {string} phase - Agent phase (plan, execute, test, deploy, monitor)
 * @param {Object} metadata - Additional metadata (optional)
 * @returns {number} Agent run ID
 */
export function createAgentRun(sessionId, phase, metadata = null) {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO agent_runs (session_id, phase, status, metadata)
      VALUES (?, ?, 'running', ?)
    `);
    const metadataJson = metadata ? JSON.stringify(metadata) : null;
    const result = stmt.run(sessionId, phase, metadataJson);
    logger.info(`Created agent run ${result.lastInsertRowid} for phase ${phase}`);
    return result.lastInsertRowid;
  } catch (error) {
    logger.error('Failed to create agent run', { sessionId, phase, error: error.message });
    throw error;
  }
}

/**
 * Update agent run status
 * @param {number} runId - Agent run ID
 * @param {string} status - New status (success, failed, retrying)
 * @param {string|null} errorMessage - Error message if failed
 * @param {number|null} retryCount - Retry count if retrying
 */
export function updateAgentRun(runId, status, errorMessage = null, retryCount = null) {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      UPDATE agent_runs
      SET status = ?,
          error_message = ?,
          retry_count = COALESCE(?, retry_count),
          completed_at = CASE WHEN ? IN ('success', 'failed') THEN CURRENT_TIMESTAMP ELSE completed_at END
      WHERE id = ?
    `);
    stmt.run(status, errorMessage, retryCount, status, runId);
    logger.info(`Updated agent run ${runId} to status ${status}`);
  } catch (error) {
    logger.error('Failed to update agent run', { runId, status, error: error.message });
    throw error;
  }
}

/**
 * Get agent runs for a session
 * @param {number} sessionId - Session ID
 * @param {string|null} phase - Filter by phase (optional)
 * @returns {Array} Array of agent run objects
 */
export function getAgentRuns(sessionId, phase = null) {
  try {
    const db = getDatabase();
    let query = `
      SELECT * FROM agent_runs
      WHERE session_id = ?
    `;
    const params = [sessionId];

    if (phase) {
      query += ' AND phase = ?';
      params.push(phase);
    }

    query += ' ORDER BY started_at DESC';

    const stmt = db.prepare(query);
    return stmt.all(...params);
  } catch (error) {
    logger.error('Failed to get agent runs', { sessionId, phase, error: error.message });
    throw error;
  }
}

/**
 * Get the latest agent run for a session and phase
 * @param {number} sessionId - Session ID
 * @param {string} phase - Agent phase
 * @returns {Object|null} Agent run object or null
 */
export function getLatestAgentRun(sessionId, phase) {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT * FROM agent_runs
      WHERE session_id = ? AND phase = ?
      ORDER BY started_at DESC
      LIMIT 1
    `);
    return stmt.get(sessionId, phase);
  } catch (error) {
    logger.error('Failed to get latest agent run', { sessionId, phase, error: error.message });
    throw error;
  }
}

export default {
  createSession,
  getActiveSession,
  updateSessionActivity,
  closeSession,
  addMessage,
  getRecentMessages,
  createAgentRun,
  updateAgentRun,
  getAgentRuns,
  getLatestAgentRun
};
