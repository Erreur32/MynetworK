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
    host: '0.0.0.0', // Listen on all interfaces to allow access via IP
    allowedHosts: ['mwk-dev.myoueb.fr'],
    // Configure HMR WebSocket
    // In Docker dev, use DASHBOARD_PORT (host port) instead of VITE_PORT (container port)
    // Vite will automatically detect the host from the browser's window.location.hostname
    // clientPort should be the port the browser connects to (host port in Docker)
    hmr: {
      clientPort: parseInt(process.env.DASHBOARD_PORT || process.env.VITE_PORT || '5173', 10),
      // Vite will automatically detect the host from the browser's window.location.hostname
      // So if you access via 192.168.1.150:3666, HMR will use ws://192.168.1.150:3666
    },
    proxy: {
      '/api': {
        // Use localhost for proxy - Vite proxy runs on the same machine as the backend
        // When accessing via IP (192.168.1.150), the proxy still connects to localhost:3003
        // because the proxy runs server-side on the same machine
        // IMPORTANT: Use PORT (container port) not SERVER_PORT (host port) in Docker
        // In Docker dev: PORT=3003 (container), SERVER_PORT=3668 (host)
        // In npm dev: PORT=3003 or SERVER_PORT=3003 (same value)
        target: `http://127.0.0.1:${process.env.PORT || process.env.SERVER_PORT || '3003'}`,
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
        // IMPORTANT: Use PORT (container port) not SERVER_PORT (host port) in Docker
        // In Docker dev: PORT=3003 (container), SERVER_PORT=3668 (host)
        // In npm dev: PORT=3003 or SERVER_PORT=3003 (same value)
        target: `ws://127.0.0.1:${process.env.PORT || process.env.SERVER_PORT || '3003'}`,
        ws: true,
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path, // Don't rewrite the path, pass it as-is
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
          (proxy as any).on('proxyResWs', (_proxyRes: any, _req: any, socket: any) => {
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
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // Don't split React/React-DOM - keep them in main chunk to avoid issues with lazy loading
          // Separate Recharts into vendor-charts chunk
          if (id.includes('recharts')) {
            return 'vendor-charts';
          }
          // Separate Lucide React icons into vendor-icons chunk
          if (id.includes('lucide-react')) {
            return 'vendor-icons';
          }
          // Separate Zustand state management into vendor-state chunk
          if (id.includes('zustand')) {
            return 'vendor-state';
          }
          // Separate other node_modules dependencies into vendor chunk (but not React)
          if (id.includes('node_modules') && !id.includes('react') && !id.includes('react-dom')) {
            return 'vendor';
          }
        }
      }
    },
    // Increase chunk size warning limit to 600 KB (optional, but we're splitting anyway)
    chunkSizeWarningLimit: 600
  }
});
