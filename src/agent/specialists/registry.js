import logger from '../../utils/logger.js';

/**
 * Specialist Registry
 *
 * Central registry for all specialist agents. Handles:
 * - Specialist registration
 * - Task delegation
 * - Specialist lookup
 * - Load balancing (future)
 *
 * Based on Claude Code's specialist coordination system
 */
export class SpecialistRegistry {
  constructor() {
    this.specialists = new Map();
    this.delegationHistory = [];
  }

  /**
   * Register a specialist agent
   *
   * @param {SpecialistAgent} specialist - Specialist instance
   */
  register(specialist) {
    if (this.specialists.has(specialist.name)) {
      logger.warn('Specialist already registered, replacing', {
        name: specialist.name
      });
    }

    this.specialists.set(specialist.name, specialist);
    logger.info('Specialist registered', {
      name: specialist.name,
      capabilities: specialist.capabilities
    });
  }

  /**
   * Unregister a specialist
   *
   * @param {string} name - Specialist name
   * @returns {boolean} True if specialist was removed
   */
  unregister(name) {
    const removed = this.specialists.delete(name);
    if (removed) {
      logger.info('Specialist unregistered', { name });
    }
    return removed;
  }

  /**
   * Find specialist by name
   *
   * @param {string} name - Specialist name
   * @returns {SpecialistAgent|null} Specialist instance or null
   */
  findByName(name) {
    return this.specialists.get(name) || null;
  }

  /**
   * Find specialist that can handle the given task
   *
   * @param {string|Object} task - Task description or object
   * @returns {SpecialistAgent|null} Specialist instance or null
   */
  findSpecialist(task) {
    for (const specialist of this.specialists.values()) {
      if (specialist.canHandle(task)) {
        logger.info('Specialist found for task', {
          specialist: specialist.name,
          task: typeof task === 'string' ? task : task.description
        });
        return specialist;
      }
    }

    logger.warn('No specialist found for task', {
      task: typeof task === 'string' ? task : task.description
    });
    return null;
  }

  /**
   * Delegate task to appropriate specialist
   *
   * @param {string|Object} task - Task to delegate
   * @param {Object} context - Execution context
   * @returns {Promise<Object>} Delegation result
   */
  async delegate(task, context = {}) {
    const specialist = this.findSpecialist(task);

    if (!specialist) {
      const error = 'No specialist available to handle task';
      logger.error(error, {
        task: typeof task === 'string' ? task : task.description
      });
      return {
        success: false,
        error,
        task
      };
    }

    try {
      logger.info('Delegating task to specialist', {
        specialist: specialist.name,
        task: typeof task === 'string' ? task : task.description
      });

      const startTime = Date.now();
      const result = await specialist.execute(task, context);
      const duration = Date.now() - startTime;

      // Record delegation
      this.delegationHistory.push({
        specialist: specialist.name,
        task: typeof task === 'string' ? task : task.description,
        success: result.success,
        duration,
        timestamp: new Date().toISOString()
      });

      logger.info('Task delegation completed', {
        specialist: specialist.name,
        success: result.success,
        duration: `${duration}ms`
      });

      return result;
    } catch (error) {
      logger.error('Task delegation failed', {
        specialist: specialist.name,
        error: error.message
      });

      return {
        success: false,
        error: error.message,
        specialist: specialist.name,
        task
      };
    }
  }

  /**
   * Delegate to specific specialist by name
   *
   * @param {string} specialistName - Specialist name
   * @param {Object} task - Task details
   * @param {Object} context - Execution context
   * @returns {Promise<Object>} Delegation result
   */
  async delegateTo(specialistName, task, context = {}) {
    const specialist = this.findByName(specialistName);

    if (!specialist) {
      const error = `Specialist '${specialistName}' not found`;
      logger.error(error);
      return {
        success: false,
        error,
        task
      };
    }

    try {
      logger.info('Delegating to specific specialist', {
        specialist: specialistName,
        task: typeof task === 'string' ? task : task.description
      });

      const result = await specialist.execute(task, context);
      return result;
    } catch (error) {
      logger.error('Specialist delegation failed', {
        specialist: specialistName,
        error: error.message
      });

      return {
        success: false,
        error: error.message,
        specialist: specialistName,
        task
      };
    }
  }

  /**
   * List all registered specialists
   *
   * @returns {Array<Object>} Array of specialist info objects
   */
  listSpecialists() {
    return Array.from(this.specialists.values()).map(s => s.getInfo());
  }

  /**
   * Get delegation history
   *
   * @param {number} limit - Maximum number of records to return
   * @returns {Array<Object>} Delegation history
   */
  getHistory(limit = 50) {
    return this.delegationHistory.slice(-limit);
  }

  /**
   * Clear delegation history
   */
  clearHistory() {
    this.delegationHistory = [];
    logger.info('Delegation history cleared');
  }

  /**
   * Get statistics about specialist usage
   *
   * @returns {Object} Usage statistics
   */
  getStats() {
    const stats = {
      totalDelegations: this.delegationHistory.length,
      successfulDelegations: 0,
      failedDelegations: 0,
      specialistUsage: {},
      averageDuration: 0
    };

    let totalDuration = 0;

    for (const record of this.delegationHistory) {
      if (record.success) {
        stats.successfulDelegations++;
      } else {
        stats.failedDelegations++;
      }

      stats.specialistUsage[record.specialist] =
        (stats.specialistUsage[record.specialist] || 0) + 1;

      totalDuration += record.duration || 0;
    }

    if (stats.totalDelegations > 0) {
      stats.averageDuration = Math.round(totalDuration / stats.totalDelegations);
    }

    stats.successRate = stats.totalDelegations > 0
      ? ((stats.successfulDelegations / stats.totalDelegations) * 100).toFixed(2) + '%'
      : '0%';

    return stats;
  }
}
