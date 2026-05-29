/**
 * Database migration script
 * Adds missing columns to existing databases
 */

import Database from 'better-sqlite3';
import logger from '../utils/logger.js';

/**
 * Run database migrations
 * @param {Database} db - SQLite database instance
 */
export function runMigrations(db) {
  logger.info('Running database migrations...');

  try {
    // Check if platform column exists in sessions table
    const tableInfo = db.prepare("PRAGMA table_info(sessions)").all();
    const hasPlatform = tableInfo.some(col => col.name === 'platform');
    const hasTextId = tableInfo.some(col => col.name === 'id' && col.type === 'TEXT');

    if (!hasPlatform) {
      logger.info('Adding platform column to sessions table');
      db.prepare(`
        ALTER TABLE sessions
        ADD COLUMN platform TEXT DEFAULT 'telegram'
        CHECK(platform IN ('telegram', 'web', 'cli'))
      `).run();
      logger.info('✓ Added platform column');
    }

    // If id is still INTEGER, we need to recreate the table
    if (!hasTextId) {
      logger.info('Migrating sessions.id from INTEGER to TEXT');

      // Create new table with correct schema
      db.prepare(`
        CREATE TABLE sessions_new (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          platform TEXT DEFAULT 'telegram' CHECK(platform IN ('telegram', 'web', 'cli')),
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          status TEXT DEFAULT 'active',
          last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
          linked_issue TEXT
        )
      `).run();

      // Copy existing data, converting INTEGER ids to TEXT
      db.prepare(`
        INSERT INTO sessions_new (id, user_id, platform, created_at, status, last_activity, linked_issue)
        SELECT
          CAST(id AS TEXT),
          CAST(user_id AS TEXT),
          COALESCE(platform, 'telegram'),
          created_at,
          status,
          last_activity,
          linked_issue
        FROM sessions
      `).run();

      // Drop old table and rename new one
      db.prepare('DROP TABLE sessions').run();
      db.prepare('ALTER TABLE sessions_new RENAME TO sessions').run();

      // Recreate indexes
      db.prepare('CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)').run();
      db.prepare('CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status)').run();
      db.prepare('CREATE INDEX IF NOT EXISTS idx_sessions_linked_issue ON sessions(linked_issue)').run();

      logger.info('✓ Migrated sessions.id to TEXT');
    }

    logger.info('✅ Database migrations completed');
  } catch (error) {
    logger.error('Migration failed', { error: error.message });
    throw error;
  }
}

export default runMigrations;
