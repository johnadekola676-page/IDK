/**
 * WebSocket server for real-time agent progress updates
 */

import logger from '../utils/logger.js';

/**
 * Initialize WebSocket server with Socket.io
 * @param {Object} io - Socket.io server instance
 */
export function initWebSocket(io) {
  io.on('connection', (socket) => {
    logger.info('WebSocket client connected', {
      socketId: socket.id,
      address: socket.handshake.address
    });

    // Handle session subscription
    socket.on('subscribe', (sessionId) => {
      if (!sessionId) {
        socket.emit('error', { message: 'Session ID required' });
        return;
      }

      const room = `session-${sessionId}`;
      socket.join(room);

      logger.info('Client subscribed to session', {
        socketId: socket.id,
        sessionId,
        room
      });

      socket.emit('subscribed', { sessionId, room });
    });

    // Handle session unsubscription
    socket.on('unsubscribe', (sessionId) => {
      if (!sessionId) {
        socket.emit('error', { message: 'Session ID required' });
        return;
      }

      const room = `session-${sessionId}`;
      socket.leave(room);

      logger.info('Client unsubscribed from session', {
        socketId: socket.id,
        sessionId,
        room
      });

      socket.emit('unsubscribed', { sessionId, room });
    });

    // Handle ping/pong for connection health
    socket.on('ping', () => {
      socket.emit('pong', { timestamp: Date.now() });
    });

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      logger.info('WebSocket client disconnected', {
        socketId: socket.id,
        reason
      });
    });

    // Handle errors
    socket.on('error', (error) => {
      logger.error('WebSocket error', {
        socketId: socket.id,
        error: error.message
      });
    });
  });

  // Store io instance globally for access from agent loop
  global.wsServer = io;

  logger.info('WebSocket server initialized');

  return io;
}

/**
 * Broadcast progress update to session subscribers
 * @param {string} sessionId - Session ID
 * @param {Object} data - Progress data
 */
export function broadcastProgress(sessionId, data) {
  if (!global.wsServer) {
    logger.warn('WebSocket server not initialized');
    return;
  }

  const room = `session-${sessionId}`;
  global.wsServer.to(room).emit('progress', {
    sessionId,
    timestamp: new Date().toISOString(),
    ...data
  });

  logger.debug('Progress broadcasted', {
    sessionId,
    room,
    phase: data.phase,
    status: data.status
  });
}

/**
 * Broadcast message to session subscribers
 * @param {string} sessionId - Session ID
 * @param {Object} message - Message data
 */
export function broadcastMessage(sessionId, message) {
  if (!global.wsServer) {
    logger.warn('WebSocket server not initialized');
    return;
  }

  const room = `session-${sessionId}`;
  global.wsServer.to(room).emit('message', {
    sessionId,
    timestamp: new Date().toISOString(),
    ...message
  });

  logger.debug('Message broadcasted', {
    sessionId,
    room,
    messageId: message.id
  });
}

/**
 * Broadcast agent status change
 * @param {string} sessionId - Session ID
 * @param {Object} status - Status data
 */
export function broadcastStatus(sessionId, status) {
  if (!global.wsServer) {
    logger.warn('WebSocket server not initialized');
    return;
  }

  const room = `session-${sessionId}`;
  global.wsServer.to(room).emit('status', {
    sessionId,
    timestamp: new Date().toISOString(),
    ...status
  });

  logger.debug('Status broadcasted', {
    sessionId,
    room,
    status: status.status
  });
}
