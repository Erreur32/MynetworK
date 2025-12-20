import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';
import './styles/themes.css';
import { initTheme } from './utils/themeManager';

// In production, suppress WebSocket "Invalid frame header" errors
// These errors occur when Nginx is not properly configured for WebSocket
// The HTTP polling fallback handles data updates correctly
if (import.meta.env.PROD) {
  const originalConsoleError = console.error;
  console.error = (...args: any[]) => {
    const message = args.join(' ');
    // Suppress WebSocket "Invalid frame header" errors in production
    // These are expected when Nginx doesn't support WebSocket properly
    // The application works correctly with HTTP polling fallback
    if (
      message.includes('WebSocket connection to') &&
      message.includes('failed') &&
      (message.includes('Invalid frame header') || message.includes('1006'))
    ) {
      // Silently ignore - HTTP polling fallback is active
      return;
    }
    // Log all other errors normally
    originalConsoleError.apply(console, args);
  };
}

// Initialize theme before rendering (async, but don't block rendering)
initTheme().catch(err => console.warn('Theme initialization error:', err));

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);