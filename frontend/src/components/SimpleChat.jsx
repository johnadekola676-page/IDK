/**
 * Simple Chat Interface
 * Clean, mobile-first design inspired by Portable.dev
 */

import { useState, useEffect, useRef } from 'react';
import { Send, ArrowLeft, Settings, Menu } from 'lucide-react';
import { useWebSocket } from '../hooks/useWebSocket';
import RepoSelector from './RepoSelector';
import './SimpleChat.css';

const API_BASE = import.meta.env.VITE_API_URL || window.location.origin;

export default function SimpleChat() {
  const [sessionId, setSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [currentRepo, setCurrentRepo] = useState(null);
  const messagesEndRef = useRef(null);

  // WebSocket connection for real-time updates
  const { connected, message: wsMessage, isReconnecting } = useWebSocket(sessionId);

  // Initialize session and load saved repo on mount
  useEffect(() => {
    // Load saved repository from localStorage
    const savedRepo = localStorage.getItem('selectedRepo');
    if (savedRepo) {
      try {
        setCurrentRepo(JSON.parse(savedRepo));
      } catch (e) {
        console.error('Failed to parse saved repo:', e);
      }
    }

    initializeSession();
  }, []);

  // Handle WebSocket messages
  useEffect(() => {
    if (wsMessage && wsMessage.role === 'assistant') {
      setMessages(prev => [...prev, {
        id: wsMessage.id || Date.now(),
        role: 'assistant',
        content: wsMessage.content || wsMessage.message,
        timestamp: wsMessage.timestamp || new Date().toISOString()
      }]);
      setIsLoading(false);
    }
  }, [wsMessage]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const initializeSession = async () => {
    try {
      // Create a new session
      const response = await fetch(`${API_BASE}/api/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: 'web_user',
          platform: 'web'
        })
      });

      const data = await response.json();
      if (data.success && data.session) {
        setSessionId(data.session.id);

        // Load existing messages if any
        if (data.session.messages && data.session.messages.length > 0) {
          setMessages(data.session.messages);
        }
      }
    } catch (error) {
      console.error('Failed to initialize session:', error);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading || !sessionId) return;

    const userMessage = {
      id: Date.now(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date().toISOString()
    };

    // Add user message to UI immediately
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // Trigger agent task execution (like Telegram does)
      const response = await fetch(`${API_BASE}/api/agent/task`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId: sessionId,
          task: userMessage.content,
          userId: 'web_user',
          repository: currentRepo // Pass selected repo to agent
        })
      });

      if (!response.ok) {
        throw new Error('Failed to start agent task');
      }

      // Agent will execute full harness logic and send responses via WebSocket
    } catch (error) {
      console.error('Failed to send message:', error);
      setMessages(prev => [...prev, {
        id: Date.now(),
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date().toISOString()
      }]);
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="simple-chat">
      {/* Top Bar */}
      <div className="chat-header">
        <button className="icon-btn" onClick={() => window.history.back()}>
          <ArrowLeft size={20} />
        </button>
        <div className="header-title">
          <h1>Claude Agent</h1>
          <span className={`status-dot ${connected ? 'connected' : 'disconnected'}`} />
          {isReconnecting && <span className="status-text">Reconnecting...</span>}
        </div>
        <button className="icon-btn" onClick={() => setShowMenu(!showMenu)}>
          <Menu size={20} />
        </button>
      </div>

      {/* Menu Dropdown */}
      {showMenu && (
        <div className="menu-dropdown">
          <div className="menu-item">
            <RepoSelector
              currentRepo={currentRepo}
              onRepoChange={(repo) => {
                setCurrentRepo(repo);
                localStorage.setItem('selectedRepo', JSON.stringify(repo));
              }}
            />
          </div>
          <button onClick={() => {
            setMessages([]);
            initializeSession();
            setShowMenu(false);
          }}>
            New Session
          </button>
          <button onClick={() => setShowMenu(false)}>
            <Settings size={16} />
            Settings
          </button>
        </div>
      )}

      {/* Messages Area */}
      <div className="messages-container">
        {messages.length === 0 ? (
          <div className="empty-state">
            <h2>Welcome!</h2>
            <p>Ask me to help with your coding tasks.</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`message ${msg.role === 'user' ? 'message-user' : 'message-agent'}`}
            >
              <div className="message-bubble">
                <div className="message-content">{msg.content}</div>
                <div className="message-time">{formatTime(msg.timestamp)}</div>
              </div>
            </div>
          ))
        )}
        {isLoading && (
          <div className="message message-agent">
            <div className="message-bubble">
              <div className="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="input-container">
        <div className="input-wrapper">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type a message..."
            disabled={isLoading || !sessionId}
            className="message-input"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading || !sessionId}
            className="send-button"
          >
            <Send size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}
