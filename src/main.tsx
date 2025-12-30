import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';
import './styles/themes.css';
import { initTheme } from './utils/themeManager';

// Application version and name
const APP_NAME = 'MyNetwork';
const APP_VERSION = '0.3.5';

// Console log with colored background
const logAppInfo = () => {
    const styles = [
        'background: linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        'color: white',
        'padding: 12px 20px',
        'border-radius: 8px',
        'font-size: 14px',
        'font-weight: bold',
        'font-family: monospace'
    ].join(';');
    
    console.log(`%c${APP_NAME} v${APP_VERSION}`, styles);
    console.log(`%cScript: main.tsx`, 'background: #1a1a1a; color: #10b981; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-family: monospace');
};

// Log app info on startup
logAppInfo();

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