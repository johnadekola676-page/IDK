/**
 * Main Application Component
 * Router for Simple Chat and MAX Dashboard
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import SimpleChat from './components/SimpleChat';
import MAXDashboard from './components/MAX/MAXDashboard';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<SimpleChat />} />
        <Route path="/max" element={<MAXDashboard />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
