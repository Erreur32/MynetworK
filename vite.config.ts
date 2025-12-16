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
        timeout: 10000
      },
      '/ws': {
        target: `ws://localhost:${process.env.SERVER_PORT || process.env.PORT || '3003'}`,
        ws: true,
        changeOrigin: true
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