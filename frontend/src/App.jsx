/**
 * Main Application Component
 */

import { useState, useEffect } from 'react';
import { ChatInterface } from './components/ChatInterface';
import { SOPProgress } from './components/SOPProgress';
import { FileTree } from './components/FileTree';
import { useWebSocket } from './hooks/useWebSocket';
import * as api from './services/api';
import './App.css';

function App() {
  const [sessionId, setSessionId] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [messages, setMessages] = useState([]);
  const [agentRuns, setAgentRuns] = useState([]);
  const [fileTree, setFileTree] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const { connected, progress, message } = useWebSocket(sessionId);

  // Load sessions on mount
  useEffect(() => {
    loadSessions();
    loadFileTree();
  }, []);

  // Load session data when sessionId changes
  useEffect(() => {
    if (sessionId) {
      loadSessionData(sessionId);
    }
  }, [sessionId]);

  // Handle new WebSocket messages
  useEffect(() => {
    if (message && message.sessionId === sessionId) {
      setMessages(prev => [...prev, {
        id: message.id,
        role: message.role,
        content: message.content,
        timestamp: message.timestamp
      }]);
    }
  }, [message, sessionId]);

  // Handle progress updates
  useEffect(() => {
    if (progress && progress.sessionId === sessionId) {
      // Reload agent runs to get latest status
      loadAgentRuns(sessionId);
    }
  }, [progress, sessionId]);

  const loadSessions = async () => {
    try {
      const data = await api.getSessions(10, 0);
      setSessions(data.sessions || []);

      // Auto-select first session or create new one
      if (data.sessions && data.sessions.length > 0) {
        setSessionId(data.sessions[0].id);
      } else {
        await createNewSession();
      }
    } catch (error) {
      console.error('Failed to load sessions:', error);
    }
  };

  const loadSessionData = async (sid) => {
    try {
      const data = await api.getSession(sid);
      setMessages(data.session.messages || []);
      setAgentRuns(data.session.agentRuns || []);
    } catch (error) {
      console.error('Failed to load session data:', error);
    }
  };

  const loadAgentRuns = async (sid) => {
    try {
      const data = await api.getAgentRuns(sid);
      setAgentRuns(data.runs || []);
    } catch (error) {
      console.error('Failed to load agent runs:', error);
    }
  };

  const loadFileTree = async () => {
    try {
      const data = await api.getFileTree(3);
      setFileTree(data.tree);
    } catch (error) {
      console.error('Failed to load file tree:', error);
    }
  };

  const createNewSession = async () => {
    try {
      const userId = 'web_user_' + Date.now();
      const data = await api.createSession(userId);
      setSessionId(data.session.id);
      setSessions(prev => [data.session, ...prev]);
    } catch (error) {
      console.error('Failed to create session:', error);
    }
  };

  const handleSendMessage = async (content) => {
    if (!sessionId) {
      await createNewSession();
    }

    setIsLoading(true);

    try {
      // Send message
      const msgData = await api.sendMessage(sessionId, content);
      setMessages(prev => [...prev, msgData.message]);

      // Trigger agent task
      await api.triggerAgentTask(sessionId, content, 'web_user');
    } catch (error) {
      console.error('Failed to send message:', error);
      alert('Failed to send message: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileClick = async (file) => {
    try {
      const data = await api.getFileContent(file.relativePath);
      // TODO: Open file in code editor
      console.log('File content:', data);
    } catch (error) {
      console.error('Failed to load file:', error);
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-logo">
          <h1>Autonomous Agent</h1>
        </div>
        <div className="app-session-selector">
          <select
            value={sessionId || ''}
            onChange={(e) => setSessionId(e.target.value)}
            className="session-select"
          >
            {sessions.map(session => (
              <option key={session.id} value={session.id}>
                Session {new Date(session.created_at).toLocaleString()}
              </option>
            ))}
          </select>
          <button onClick={createNewSession} className="new-session-btn">
            New Session
          </button>
        </div>
        <div className="app-status">
          <div className={`status-indicator ${connected ? 'connected' : 'disconnected'}`} />
          <span>{connected ? 'Connected' : 'Disconnected'}</span>
        </div>
      </header>

      <div className="app-body">
        <FileTree tree={fileTree} onFileClick={handleFileClick} />

        <div className="app-main">
          <ChatInterface
            messages={messages}
            onSendMessage={handleSendMessage}
            isLoading={isLoading}
          />
        </div>

        <SOPProgress agentRuns={agentRuns} currentProgress={progress} />
      </div>
    </div>
  );
}

export default App;
