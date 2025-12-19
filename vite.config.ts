import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Intercept console.error to suppress proxy errors in development
// These errors are normal when the backend is restarting or connections are closed
if (process.env.NODE_ENV !== 'production') {
  const originalConsoleError = console.error;
  console.error = (...args: any[]) => {
    const message = args.join(' ');
    // Suppress Vite WebSocket proxy errors - they are normal during development
    if (
      message.includes('[vite] ws proxy error') ||
      message.includes('This socket has been ended by the other party') ||
      (message.includes('[vite]') && message.includes('proxy error') && message.includes('socket')) ||
      // Suppress HTTP proxy errors during backend restart
      (message.includes('[vite] http proxy error') && message.includes('ECONNREFUSED')) ||
      // Suppress WebSocket connection errors
      message.includes('WebSocket connection to') && message.includes('failed') ||
      message.includes('Invalid frame header')
    ) {
      // Silently ignore - these are expected during development
      return;
    }
    // Log all other errors normally
    originalConsoleError.apply(console, args);
  };
}

export default defineConfig({
  server: {
    port: parseInt(process.env.VITE_PORT || '5173', 10),
    host: '0.0.0.0',
    allowedHosts: ['mwk-dev.myoueb.fr'],
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.SERVER_PORT || process.env.PORT || '3003'}`,
        changeOrigin: true,
        secure: false,
        timeout: 60000, // Increased timeout for long-running requests like ping
        proxyTimeout: 60000,
        configure: (proxy, _options) => {
          proxy.on('error', (err, req, res) => {
            // Suppress ECONNREFUSED errors during backend restart - they are normal
            const errorMessage = err?.message || String(err || '');
            if (errorMessage.includes('ECONNREFUSED')) {
              // Return a proper JSON error response so the frontend can handle it gracefully
              if (res && !res.headersSent) {
                res.writeHead(503, {
                  'Content-Type': 'application/json',
                });
                res.end(JSON.stringify({ 
                  success: false, 
                  error: { 
                    code: 'CONNECTION_REFUSED', 
                    message: 'Le serveur n\'est pas disponible. Reconnexion en cours...',
                    temporary: true
                  } 
                }));
              }
              return;
            }
            // Handle other proxy errors gracefully
            if (res && !res.headersSent) {
              res.writeHead(500, {
                'Content-Type': 'application/json',
              });
              res.end(JSON.stringify({ success: false, error: { code: 'PROXY_ERROR', message: 'Erreur de proxy' } }));
            }
          });
        }
      },
      '/ws': {
        target: `ws://localhost:${process.env.SERVER_PORT || process.env.PORT || '3003'}`,
        ws: true,
        changeOrigin: true,
        secure: false,
        configure: (proxy, _options) => {
          // Suppress all WebSocket proxy errors - they are normal during connection attempts
          // The frontend will automatically retry connecting
          const shouldSuppressError = (err: any): boolean => {
            const errorMessage = err?.message || String(err || '');
            return (
              errorMessage.includes('socket') ||
              errorMessage.includes('ECONNRESET') ||
              errorMessage.includes('ECONNREFUSED') ||
              errorMessage.includes('ended by the other party') ||
              errorMessage.includes('ECONNABORTED') ||
              errorMessage.includes('ETIMEDOUT')
            );
          };
          
          // Handle WebSocket proxy errors - suppress all common errors
          proxy.on('error', (err, _req, _res) => {
            if (!shouldSuppressError(err)) {
              console.error('[Vite WS Proxy] Unexpected error:', err?.message || String(err));
            }
            // Silently ignore all other errors
          });
          
          // Handle WebSocket upgrade errors
          proxy.on('proxyReqWs', (proxyReq, req, socket) => {
            socket.on('error', (err) => {
              // Silently suppress all socket errors during upgrade
              if (!shouldSuppressError(err)) {
                console.error('[Vite WS Proxy] Socket error:', err?.message || String(err));
              }
            });
            
            // Handle socket close during upgrade - normal behavior
            socket.on('close', () => {
              // Silently handle - this is normal
            });
          });
          
          // Handle WebSocket connection close - normal behavior
          proxy.on('close', (_res, _socket, _head) => {
            // Silently handle connection closes - this is normal
          });
          
          // Handle WebSocket upgrade response errors
          proxy.on('proxyResWs', (_proxyRes, _req, socket) => {
            socket.on('error', (err) => {
              // Silently suppress all errors after upgrade
              if (!shouldSuppressError(err)) {
                console.error('[Vite WS Proxy] Post-upgrade error:', err?.message || String(err));
              }
            });
          });
        }
      }
    }
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    }
  }
});
