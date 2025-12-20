import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';
import './styles/themes.css';
import { initTheme } from './utils/themeManager';

// Initialize theme before rendering (async, but don't block rendering)
initTheme().catch(err => console.warn('Theme initialization error:', err));

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);