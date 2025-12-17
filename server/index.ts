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
import { logsWebSocket } from './services/logsWebSocket.js';

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
import { logger } from './utils/logger.js';

// Initialize database
logger.info('Server', 'Initializing database...');
initializeDatabase();
// Reload logger config after database is initialized
logger.reloadConfig();

// Create default admin user if no users exist
async function createDefaultAdmin() {
    const users = UserRepository.findAll();
    if (users.length === 0) {
        logger.info('Server', 'No users found, creating default admin user...');
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
            
            logger.success('Server', `Default admin user created: ${defaultUsername}`);
            logger.warn('Server', '⚠️  Please change the default password after first login!');
        } catch (error) {
            logger.error('Server', 'Failed to create default admin user:', error);
        }
    }
}
createDefaultAdmin();

// Initialize plugins
async function initializePlugins() {
    logger.info('Server', 'Initializing plugins...');
    try {
        await pluginManager.initializeAllPlugins();
        logger.success('Server', 'All plugins initialized');
    } catch (error) {
        logger.error('Server', 'Failed to initialize plugins:', error);
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

// Request logging (only in debug mode)
app.use((req, _res, next) => {
  logger.debug('HTTP', `${req.method} ${req.path}`);
  next();
});

// API Routes
// New routes (users, plugins, logs)
import logsRoutes from './routes/logs.js';
import updatesRoutes from './routes/updates.js';
import debugRoutes from './routes/debug.js';

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
app.use('/api/updates', updatesRoutes);
app.use('/api/debug', debugRoutes);

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

// Initialize WebSocket servers
connectionWebSocket.init(server);
logsWebSocket.init(server);

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
  
  // ANSI color codes for terminal output
  const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    cyan: '\x1b[36m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    white: '\x1b[37m',
    bgCyan: '\x1b[46m',
    bgBlue: '\x1b[44m',
  };

  // Helper function to calculate visible length (ignoring ANSI codes)
  // Emojis are counted as 2 characters in most terminals
  const visibleLength = (str: string): number => {
    // Remove ANSI escape codes
    const ansiRegex = /\x1b\[[0-9;]*m/g;
    let cleaned = str.replace(ansiRegex, '');
    // Count emojis as 2 characters (they typically take 2 character positions in terminal)
    const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu;
    const emojiMatches = cleaned.match(emojiRegex);
    const emojiCount = emojiMatches ? emojiMatches.length : 0;
    // Remove emojis from length calculation and add them back as 2 chars each
    const withoutEmojis = cleaned.replace(emojiRegex, '');
    return withoutEmojis.length + (emojiCount * 2);
  };

  // Calculate content widths for all lines
  const title = 'MynetworK Backend Server';
  const subtitle = 'Multi-Source Network Dashboard';
  
  const contentLines = [
    `  🌐 Frontend WEB (Users): ${frontendWebUrl}`,
    `  💻 Frontend Local:      ${frontendLocalUrl}`,
    `  🔌 Backend API:         ${apiUrl}/api/health`,
    `  🔗 WebSocket:           ${wsUrl}`,
    `  📡 Freebox:             ${config.freebox.url}`,
    `  Features:`,
    `  ✓ User Authentication (JWT)`,
    `  ✓ Plugin System (Freebox, UniFi, ...)`,
    `  ✓ Activity Logging`
  ];
  
  // Find the longest line (visible length)
  const maxContentWidth = Math.max(
    ...contentLines.map(line => visibleLength(line)),
    visibleLength(title),
    visibleLength(subtitle)
  );
  
  // Calculate total width: content + borders (2 chars) + minimal padding (4 chars)
  // Minimum width of 60 for readability
  const width = Math.max(maxContentWidth + 4, 60);
  const minPadding = 2;
  
  // Calculate padding for centered titles
  const titlePadding = Math.max(Math.floor((width - visibleLength(title) - 2) / 2), minPadding);
  const subtitlePadding = Math.max(Math.floor((width - visibleLength(subtitle) - 2) / 2), minPadding);
  
  // Helper to pad content lines
  const padLine = (line: string, label: string, value: string): string => {
    const labelVisible = visibleLength(label);
    const valueVisible = visibleLength(value);
    const totalVisible = visibleLength(line);
    const padding = Math.max(width - totalVisible - 2, 0);
    return line + ' '.repeat(padding);
  };

  console.log(`
${colors.bright}${colors.cyan}╔${'═'.repeat(width)}╗${colors.reset}
${colors.bright}${colors.cyan}║${' '.repeat(titlePadding)}${colors.white}${colors.bright}${title}${colors.reset}${colors.cyan}${' '.repeat(width - titlePadding - visibleLength(title) - 2)}║${colors.reset}
${colors.bright}${colors.cyan}║${' '.repeat(subtitlePadding)}${colors.dim}${subtitle}${colors.reset}${colors.cyan}${' '.repeat(width - subtitlePadding - visibleLength(subtitle) - 2)}║${colors.reset}
${colors.bright}${colors.cyan}╠${'═'.repeat(width)}╣${colors.reset}
${colors.bright}${colors.cyan}║${colors.reset}  ${colors.green}🌐${colors.reset} ${colors.bright}Frontend WEB (Users):${colors.reset} ${colors.cyan}${frontendWebUrl}${colors.reset}${' '.repeat(Math.max(width - visibleLength(`  🌐 Frontend WEB (Users): ${frontendWebUrl}`) - 2, 0))}${colors.bright}${colors.cyan}║${colors.reset}
${colors.bright}${colors.cyan}║${colors.reset}  ${colors.blue}💻${colors.reset} ${colors.bright}Frontend Local:${colors.reset}      ${colors.cyan}${frontendLocalUrl}${colors.reset}${' '.repeat(Math.max(width - visibleLength(`  💻 Frontend Local:      ${frontendLocalUrl}`) - 2, 0))}${colors.bright}${colors.cyan}║${colors.reset}
${colors.bright}${colors.cyan}║${colors.reset}  ${colors.yellow}🔌${colors.reset} ${colors.bright}Backend API:${colors.reset}         ${colors.cyan}${apiUrl}/api/health${colors.reset}${' '.repeat(Math.max(width - visibleLength(`  🔌 Backend API:         ${apiUrl}/api/health`) - 2, 0))}${colors.bright}${colors.cyan}║${colors.reset}
${colors.bright}${colors.cyan}║${colors.reset}  ${colors.magenta}🔗${colors.reset} ${colors.bright}WebSocket:${colors.reset}           ${colors.cyan}${wsUrl}${colors.reset}${' '.repeat(Math.max(width - visibleLength(`  🔗 WebSocket:           ${wsUrl}`) - 2, 0))}${colors.bright}${colors.cyan}║${colors.reset}
${colors.bright}${colors.cyan}║${colors.reset}  ${colors.cyan}📡${colors.reset} ${colors.bright}Freebox:${colors.reset}             ${colors.cyan}${config.freebox.url}${colors.reset}${' '.repeat(Math.max(width - visibleLength(`  📡 Freebox:             ${config.freebox.url}`) - 2, 0))}${colors.bright}${colors.cyan}║${colors.reset}
${colors.bright}${colors.cyan}║${colors.reset}${' '.repeat(width)}${colors.bright}${colors.cyan}║${colors.reset}
${colors.bright}${colors.cyan}║${colors.reset}  ${colors.bright}${colors.white}Features:${colors.reset}${' '.repeat(Math.max(width - visibleLength('  Features:') - 2, 0))}${colors.bright}${colors.cyan}║${colors.reset}
${colors.bright}${colors.cyan}║${colors.reset}  ${colors.dim}${colors.green}✓${colors.reset} ${colors.dim}User Authentication (JWT)${colors.reset}${' '.repeat(Math.max(width - visibleLength('  ✓ User Authentication (JWT)') - 2, 0))}${colors.bright}${colors.cyan}║${colors.reset}
${colors.bright}${colors.cyan}║${colors.reset}  ${colors.dim}${colors.green}✓${colors.reset} ${colors.dim}Plugin System (Freebox, UniFi, ...)${colors.reset}${' '.repeat(Math.max(width - visibleLength('  ✓ Plugin System (Freebox, UniFi, ...)') - 2, 0))}${colors.bright}${colors.cyan}║${colors.reset}
${colors.bright}${colors.cyan}║${colors.reset}  ${colors.dim}${colors.green}✓${colors.reset} ${colors.dim}Activity Logging${colors.reset}${' '.repeat(Math.max(width - visibleLength('  ✓ Activity Logging') - 2, 0))}${colors.bright}${colors.cyan}║${colors.reset}
${colors.bright}${colors.cyan}╚${'═'.repeat(width)}╝${colors.reset}
  `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('Server', 'SIGTERM received, shutting down gracefully...');
  server.close(() => {
    logger.info('Server', 'HTTP server closed');
    // Close database connection
    const db = getDatabase();
    if (db) {
      db.close();
      logger.info('Server', 'Database connection closed');
    }
    process.exit(0);
  });
});

export default app;
