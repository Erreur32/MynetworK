import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  server: {
    port: parseInt(process.env.VITE_PORT || '5173', 10),
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.SERVER_PORT || process.env.PORT || '3003'}`,
        changeOrigin: true,
        secure: false,
        timeout: 60000, // Increased timeout for long-running requests like ping
        proxyTimeout: 60000,
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, res) => {
            // Handle proxy errors gracefully
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
        configure: (proxy, _options) => {
          // Handle WebSocket proxy errors gracefully
          proxy.on('error', (err, _req, _res) => {
            // Log but don't crash on socket errors
            if (err.message && !err.message.includes('socket') && !err.message.includes('ECONNRESET')) {
              console.error('[Vite WS Proxy] Error:', err.message);
            }
          });
          
          // Handle WebSocket upgrade errors
          proxy.on('proxyReqWs', (proxyReq, req, socket) => {
            socket.on('error', (err) => {
              // Silently handle socket errors during WebSocket upgrade
              if (err.message && !err.message.includes('socket') && !err.message.includes('ECONNRESET')) {
                console.error('[Vite WS Proxy] Socket error:', err.message);
              }
            });
          });
          
          // Handle WebSocket connection close
          proxy.on('close', (res, socket, head) => {
            // Silently handle connection closes
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