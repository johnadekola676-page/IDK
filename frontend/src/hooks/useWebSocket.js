/**
 * WebSocket connection hook for real-time updates
 */

import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const WS_URL = import.meta.env.VITE_WS_URL || window.location.origin;

export function useWebSocket(sessionId) {
  const [connected, setConnected] = useState(false);
  const [progress, setProgress] = useState(null);
  const [message, setMessage] = useState(null);
  const [status, setStatus] = useState(null);
  const socketRef = useRef(null);

  useEffect(() => {
    // Initialize socket connection
    const socket = io(WS_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10
    });

    socketRef.current = socket;

    // Connection handlers
    socket.on('connect', () => {
      console.log('WebSocket connected');
      setConnected(true);

      // Subscribe to session if provided
      if (sessionId) {
        socket.emit('subscribe', sessionId);
      }
    });

    socket.on('disconnect', () => {
      console.log('WebSocket disconnected');
      setConnected(false);
    });

    socket.on('subscribed', (data) => {
      console.log('Subscribed to session:', data.sessionId);
    });

    // Event handlers
    socket.on('progress', (data) => {
      console.log('Progress update:', data);
      setProgress(data);
    });

    socket.on('message', (data) => {
      console.log('Message received:', data);
      setMessage(data);
    });

    socket.on('status', (data) => {
      console.log('Status update:', data);
      setStatus(data);
    });

    socket.on('error', (error) => {
      console.error('WebSocket error:', error);
    });

    // Cleanup
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  // Subscribe to a different session
  useEffect(() => {
    if (socketRef.current && connected && sessionId) {
      socketRef.current.emit('subscribe', sessionId);
    }
  }, [sessionId, connected]);

  const subscribe = (newSessionId) => {
    if (socketRef.current && connected) {
      socketRef.current.emit('subscribe', newSessionId);
    }
  };

  const unsubscribe = (oldSessionId) => {
    if (socketRef.current && connected) {
      socketRef.current.emit('unsubscribe', oldSessionId);
    }
  };

  return {
    connected,
    progress,
    message,
    status,
    subscribe,
    unsubscribe
  };
}
