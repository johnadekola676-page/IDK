/**
 * API client for backend communication
 */

import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || '';
const API_TOKEN = import.meta.env.VITE_API_TOKEN || '';

const api = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
    ...(API_TOKEN && { Authorization: `Bearer ${API_TOKEN}` })
  }
});

// Sessions
export const getSessions = async (limit = 50, offset = 0) => {
  const response = await api.get('/sessions', { params: { limit, offset } });
  return response.data;
};

export const getSession = async (sessionId) => {
  const response = await api.get(`/sessions/${sessionId}`);
  return response.data;
};

export const createSession = async (userId) => {
  const response = await api.post('/sessions', { userId, platform: 'web' });
  return response.data;
};

export const deleteSession = async (sessionId) => {
  const response = await api.delete(`/sessions/${sessionId}`);
  return response.data;
};

// Messages
export const getMessages = async (sessionId, limit = 100, offset = 0) => {
  const response = await api.get(`/messages/${sessionId}`, { params: { limit, offset } });
  return response.data;
};

export const sendMessage = async (sessionId, content, role = 'user') => {
  const response = await api.post(`/messages/${sessionId}`, { content, role });
  return response.data;
};

// Agent
export const triggerAgentTask = async (sessionId, task, userId) => {
  const response = await api.post('/agent/task', { sessionId, task, userId });
  return response.data;
};

export const getAgentStatus = async (sessionId) => {
  const response = await api.get(`/agent/status/${sessionId}`);
  return response.data;
};

export const getAgentRuns = async (sessionId, limit = 50, offset = 0) => {
  const response = await api.get(`/agent/runs/${sessionId}`, { params: { limit, offset } });
  return response.data;
};

// Files
export const getFiles = async (path = '') => {
  const response = await api.get('/files', { params: { path } });
  return response.data;
};

export const getFileTree = async (maxDepth = 3) => {
  const response = await api.get('/files/tree', { params: { maxDepth } });
  return response.data;
};

export const getFileContent = async (path) => {
  const response = await api.get('/files/content', { params: { path } });
  return response.data;
};

export const writeFileContent = async (path, content) => {
  const response = await api.post('/files/content', { path, content });
  return response.data;
};

// Alias for compatibility with FileExplorer component
export const updateFileContent = writeFileContent;

// Provider status (v2.0)
export const getProviderStatus = async () => {
  try {
    const response = await api.get('/agent/providers');
    return response.data;
  } catch (error) {
    console.error('Failed to get provider status:', error);
    return {};
  }
};

// Cost breakdown (v2.0)
export const getCostBreakdown = async () => {
  try {
    const response = await api.get('/agent/costs');
    return response.data;
  } catch (error) {
    console.error('Failed to get cost breakdown:', error);
    return { total: 0, breakdown: {} };
  }
};

export default api;
