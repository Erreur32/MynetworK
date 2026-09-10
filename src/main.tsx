import './i18n';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { NotificationToaster } from './components/NotificationToaster';
import './index.css';
import './styles/themes.css';
import { initTheme } from './utils/themeManager';

// Application version and name
const APP_NAME = 'MyNetwork';
const APP_VERSION = '0.10.14';

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
  
  // Suppress deprecated StorageType.persistent warning in production
  // This warning comes from dependencies using the old storage API
  const originalConsoleWarn = console.warn;
  console.warn = (...args: any[]) => {
    const message = args.join(' ');
    // Suppress only the StorageType.persistent deprecation warning
    if (message.includes('StorageType.persistent is deprecated')) {
      return; // Ignore silently
    }
    // Keep all other warnings
    originalConsoleWarn.apply(console, args);
  };
}

// A deploy can replace the built assets while a tab is still open with an
// older index.html; the chunk hash baked into its already-loaded JS then
// 404s. Vite fires 'vite:preloadError' when a dynamic import() fails for this
// reason — reload once to pick up the current index.html with fresh hashes.
// The sessionStorage flag prevents a reload loop if the failure isn't
// deploy-related; it's cleared once the app has been up for a while so a
// later, genuine deploy can still trigger one more auto-reload.
const STALE_CHUNK_RELOAD_KEY = 'mynetwork:reloaded-for-stale-chunk';
window.addEventListener('vite:preloadError', () => {
  if (sessionStorage.getItem(STALE_CHUNK_RELOAD_KEY)) return;
  sessionStorage.setItem(STALE_CHUNK_RELOAD_KEY, '1');
  window.location.reload();
});
setTimeout(() => sessionStorage.removeItem(STALE_CHUNK_RELOAD_KEY), 30000);

// Initialize theme before rendering (async, but don't block rendering)
initTheme().catch(err => console.warn('Theme initialization error:', err));

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ErrorBoundary>
        <App />
        <NotificationToaster />
      </ErrorBoundary>
    </BrowserRouter>
  </React.StrictMode>
);