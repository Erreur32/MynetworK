import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import http from 'http';
import os from 'os';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import { errorHandler } from './middleware/errorHandler.js';
import { connectionWebSocket } from './services/connectionWebSocket.js';
import { freeboxNativeWebSocket } from './services/freeboxNativeWebSocket.js';

// Database
import { initializeDatabase, getDatabase } from './database/connection.js';
import { UserRepository } from './database/models/User.js';
import { authService } from './services/authService.js';

// Plugins
import { pluginManager } from './services/pluginManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Routes
import authRoutes from './routes/auth.js';
import usersRoutes from './routes/users.js';
import pluginsRoutes from './routes/plugins.js';
import systemRoutes from './routes/system.js';
import systemServerRoutes from './routes/systemServer.js';
import connectionRoutes from './routes/connection.js';
import wifiRoutes from './routes/wifi.js';
import lanRoutes from './routes/lan.js';
import downloadsRoutes from './routes/downloads.js';
import vmRoutes from './routes/vm.js';
import callsRoutes from './routes/calls.js';
import contactsRoutes from './routes/contacts.js';
import fsRoutes from './routes/fs.js';
import tvRoutes from './routes/tv.js';
import parentalRoutes from './routes/parental.js';
import settingsRoutes from './routes/settings.js';
import notificationsRoutes from './routes/notifications.js';
import speedtestRoutes from './routes/speedtest.js';
import capabilitiesRoutes from './routes/capabilities.js';
import dhcpRoutes from './routes/dhcp.js';
import configRoutes from './routes/config.js';
import metricsRoutes from './routes/metrics.js';
import apiDocsRoutes from './routes/api-docs.js';

// Initialize database
console.log('[Server] Initializing database...');
initializeDatabase();

// Create default admin user if no users exist
async function createDefaultAdmin() {
    const users = UserRepository.findAll();
    if (users.length === 0) {
        console.log('[Server] No users found, creating default admin user...');
        try {
            const defaultUsername = process.env.DEFAULT_ADMIN_USERNAME || 'admin';
            const defaultPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'admin123';
            const defaultEmail = process.env.DEFAULT_ADMIN_EMAIL || 'admin@localhost';
            
            await authService.register({
                username: defaultUsername,
                email: defaultEmail,
                password: defaultPassword,
                role: 'admin'
            });
            
            console.log(`[Server] Default admin user created:`);
            console.log(`[Server]   Username: ${defaultUsername}`);
            console.log(`[Server]   Password: ${defaultPassword}`);
            console.log(`[Server]   ⚠️  Please change the default password after first login!`);
        } catch (error) {
            console.error('[Server] Failed to create default admin user:', error);
        }
    }
}
createDefaultAdmin();

// Initialize plugins
async function initializePlugins() {
    console.log('[Server] Initializing plugins...');
    try {
        await pluginManager.initializeAllPlugins();
        console.log('[Server] All plugins initialized');
    } catch (error) {
        console.error('[Server] Failed to initialize plugins:', error);
    }
}

// Initialize plugins (no automatic config file sync)
initializePlugins();

const app = express();

// Middleware
// In production (Docker), allow all origins since frontend is served from same server
// In development, allow localhost and common network IPs
const corsOrigin = process.env.NODE_ENV === 'production'
  ? true  // Allow all origins in production (frontend served from same origin)
  : [
      'http://localhost:3000',
      'http://localhost:5173',
      /^http:\/\/192\.168\.\d+\.\d+:5173$/,  // Allow any 192.168.x.x:5173
      /^http:\/\/192\.168\.\d+\.\d+:3000$/,  // Allow any 192.168.x.x:3000
      /^http:\/\/127\.0\.0\.1:\d+$/           // Allow 127.0.0.1 with any port
    ];
app.use(cors({
  origin: corsOrigin,
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));

// Request logging
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// API Routes
// New routes (users, plugins, logs)
import logsRoutes from './routes/logs.js';

app.use('/api/users', usersRoutes);
app.use('/api/plugins', pluginsRoutes);
app.use('/api/logs', logsRoutes);
app.use('/api/config', configRoutes);
app.use('/api/metrics', metricsRoutes);
app.use('/api/docs', apiDocsRoutes);

// Existing Freebox routes (kept for backward compatibility)
app.use('/api/auth', authRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/system', systemServerRoutes);
app.use('/api/connection', connectionRoutes);
app.use('/api/wifi', wifiRoutes);
app.use('/api/lan', lanRoutes);
app.use('/api/downloads', downloadsRoutes);
app.use('/api/vm', vmRoutes);
app.use('/api/calls', callsRoutes);
app.use('/api/contacts', contactsRoutes);
app.use('/api/fs', fsRoutes);
app.use('/api/tv', tvRoutes);
app.use('/api/parental', parentalRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/speedtest', speedtestRoutes);
app.use('/api/capabilities', capabilitiesRoutes);
app.use('/api/dhcp', dhcpRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve static files from dist folder (production build only)
// IMPORTANT: Must be BEFORE error handler for SPA fallback to work
if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, '..', 'dist');
  app.use(express.static(distPath));

  // SPA fallback - serve index.html for all non-API routes
  // Express 5 requires named wildcards, use middleware instead for compatibility
  app.use((req, res, next) => {
    // Skip API routes
    if (req.path.startsWith('/api/') || req.path.startsWith('/ws/')) {
      return next();
    }
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// Error handler - must be AFTER static files and SPA fallback
app.use(errorHandler);

// Create HTTP server (needed for WebSocket)
const server = http.createServer(app);

// Log upgrade requests for debugging
server.on('upgrade', (request, socket, head) => {
  console.log('[HTTP] Upgrade request received:', request.url);
});

// Initialize WebSocket server (our internal dashboard WS)
connectionWebSocket.init(server);

// Helper function to get network IP address
function getNetworkIP(): string | null {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      // Skip internal (loopback) and non-IPv4 addresses
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return null;
}

// Start server
const port = config.port;
const host = '0.0.0.0'; // Bind to all interfaces for Docker compatibility
server.listen(port, host, () => {
  // Determine frontend URL to display based on environment
  const isProduction = process.env.NODE_ENV === 'production';
  let frontendWebUrl: string;
  let frontendLocalUrl: string;
  
  if (isProduction) {
    // Production mode (Docker): use PUBLIC_URL or default to localhost with port mapping
    frontendWebUrl = config.publicUrl || `http://localhost:${process.env.DASHBOARD_PORT || '7505'}`;
    frontendLocalUrl = frontendWebUrl;
  } else {
    // Development mode: frontend is on Vite dev server (port 5173)
    const vitePort = process.env.VITE_PORT || '5173';
    const networkIP = getNetworkIP();
    frontendLocalUrl = `http://localhost:${vitePort}`;
    frontendWebUrl = networkIP ? `http://${networkIP}:${vitePort}` : frontendLocalUrl;
  }
  
  const apiUrl = isProduction 
    ? (config.publicUrl || `http://localhost:${process.env.DASHBOARD_PORT || '7505'}`)
    : `http://localhost:${port}`;
  const wsUrl = isProduction
    ? (config.publicUrl ? config.publicUrl.replace(/^http/, 'ws') + '/ws/connection' : `ws://localhost:${port}/ws/connection`)
    : `ws://localhost:${port}/ws/connection`;
  
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║              MynetworK Backend Server                     ║
║        Multi-Source Network Dashboard                     ║
╠═══════════════════════════════════════════════════════════╣
║  🌐 Frontend WEB (Users): ${frontendWebUrl.padEnd(35)}║
║  💻 Frontend Local:      ${frontendLocalUrl.padEnd(35)}║
║  🔌 Backend API:         ${apiUrl}/api/health${' '.repeat(Math.max(0, 35 - (apiUrl.length + 15)))}║
║  🔗 WebSocket:           ${wsUrl.padEnd(35)}║
║  📡 Freebox:             ${config.freebox.url.padEnd(35)}║
║                                                           ║
║  Features:                                                ║
║  - User Authentication (JWT)                              ║
║  - Plugin System (Freebox, UniFi, ...)                    ║
║  - Activity Logging                                       ║
╚═══════════════════════════════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Server] SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('[Server] HTTP server closed');
    // Close database connection
    const db = getDatabase();
    if (db) {
      db.close();
      console.log('[Server] Database connection closed');
    }
    process.exit(0);
  });
});

export default app;
