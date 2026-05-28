import fsRoot from 'fs-safe';
import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import logger from './logger.js';

const SANDBOX_WORKSPACE = process.env.SANDBOX_WORKSPACE || './sandbox-workspace';

// Initialize fs-safe with sandbox root
const safeFs = fsRoot.root(SANDBOX_WORKSPACE);

/**
 * Ensure sandbox workspace exists
 */
export async function ensureSandbox() {
  try {
    await fs.mkdir(SANDBOX_WORKSPACE, { recursive: true });
    logger.info(`Sandbox workspace ready: ${SANDBOX_WORKSPACE}`);
  } catch (error) {
    logger.error('Failed to create sandbox workspace', { error: error.message });
    throw error;
  }
}

/**
 * Read file from sandbox safely
 * @param {string} filePath - Relative path within sandbox
 * @returns {Promise<string>} File contents
 */
export async function readFileSafe(filePath) {
  try {
    const content = await safeFs.readFile(filePath, 'utf-8');
    logger.debug('Read file', { filePath });
    return content;
  } catch (error) {
    logger.error('Failed to read file', { filePath, error: error.message });
    throw error;
  }
}

/**
 * Write file to sandbox safely
 * @param {string} filePath - Relative path within sandbox
 * @param {string} content - File content
 */
export async function writeFileSafe(filePath, content) {
  try {
    // Ensure directory exists
    const dir = dirname(filePath);
    if (dir && dir !== '.') {
      await safeFs.mkdir(dir, { recursive: true });
    }

    await safeFs.writeFile(filePath, content, 'utf-8');
    logger.info('Wrote file', { filePath, size: content.length });
  } catch (error) {
    logger.error('Failed to write file', { filePath, error: error.message });
    throw error;
  }
}

/**
 * Check if file exists in sandbox
 * @param {string} filePath - Relative path within sandbox
 * @returns {Promise<boolean>} True if file exists
 */
export async function existsSafe(filePath) {
  try {
    await safeFs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Delete file from sandbox safely
 * @param {string} filePath - Relative path within sandbox
 */
export async function deleteFileSafe(filePath) {
  try {
    await safeFs.unlink(filePath);
    logger.info('Deleted file', { filePath });
  } catch (error) {
    logger.error('Failed to delete file', { filePath, error: error.message });
    throw error;
  }
}

/**
 * List files in directory within sandbox
 * @param {string} dirPath - Relative directory path within sandbox
 * @returns {Promise<Array<string>>} List of files
 */
export async function listFilesSafe(dirPath = '.') {
  try {
    const files = await safeFs.readdir(dirPath);
    logger.debug('Listed files', { dirPath, count: files.length });
    return files;
  } catch (error) {
    logger.error('Failed to list files', { dirPath, error: error.message });
    throw error;
  }
}

/**
 * Create directory in sandbox safely
 * @param {string} dirPath - Relative directory path within sandbox
 */
export async function mkdirSafe(dirPath) {
  try {
    await safeFs.mkdir(dirPath, { recursive: true });
    logger.info('Created directory', { dirPath });
  } catch (error) {
    logger.error('Failed to create directory', { dirPath, error: error.message });
    throw error;
  }
}

/**
 * Get file stats
 * @param {string} filePath - Relative path within sandbox
 * @returns {Promise<Object>} File stats
 */
export async function getStatsSafe(filePath) {
  try {
    const stats = await safeFs.stat(filePath);
    return {
      size: stats.size,
      isDirectory: stats.isDirectory(),
      isFile: stats.isFile(),
      modified: stats.mtime,
      created: stats.birthtime
    };
  } catch (error) {
    logger.error('Failed to get file stats', { filePath, error: error.message });
    throw error;
  }
}

/**
 * Copy file within sandbox
 * @param {string} srcPath - Source path
 * @param {string} destPath - Destination path
 */
export async function copyFileSafe(srcPath, destPath) {
  try {
    const content = await safeFs.readFile(srcPath);
    const destDir = dirname(destPath);
    if (destDir && destDir !== '.') {
      await safeFs.mkdir(destDir, { recursive: true });
    }
    await safeFs.writeFile(destPath, content);
    logger.info('Copied file', { srcPath, destPath });
  } catch (error) {
    logger.error('Failed to copy file', { srcPath, destPath, error: error.message });
    throw error;
  }
}

/**
 * Read directory tree recursively
 * @param {string} dirPath - Directory path
 * @param {number} maxDepth - Maximum depth to recurse
 * @returns {Promise<Array<string>>} List of all file paths
 */
export async function readDirectoryTree(dirPath = '.', maxDepth = 5) {
  const files = [];

  async function traverse(currentPath, depth) {
    if (depth > maxDepth) return;

    try {
      const entries = await safeFs.readdir(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(currentPath, entry.name);

        if (entry.isDirectory()) {
          // Skip node_modules and hidden directories
          if (entry.name !== 'node_modules' && !entry.name.startsWith('.')) {
            await traverse(fullPath, depth + 1);
          }
        } else if (entry.isFile()) {
          files.push(fullPath);
        }
      }
    } catch (error) {
      logger.warn('Error traversing directory', { path: currentPath, error: error.message });
    }
  }

  await traverse(dirPath, 0);
  return files;
}

/**
 * Get absolute path within sandbox
 * @param {string} relativePath - Relative path
 * @returns {string} Absolute path
 */
export function getAbsolutePath(relativePath) {
  return join(SANDBOX_WORKSPACE, relativePath);
}

export default {
  ensureSandbox,
  readFileSafe,
  writeFileSafe,
  existsSafe,
  deleteFileSafe,
  listFilesSafe,
  mkdirSafe,
  getStatsSafe,
  copyFileSafe,
  readDirectoryTree,
  getAbsolutePath,
  SANDBOX_WORKSPACE
};
