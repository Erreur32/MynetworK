import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import http from 'http';
import os from 'os';
import fsSync from 'fs';
import { fileURLToPath } from 'url';
import { config, getPublicUrl } from './config.js';
import { AppConfigRepository } from './database/models/AppConfig.js';
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
import securityRoutes from './routes/security.js';
import { securityNotificationService } from './services/securityNotificationService.js';
import { logger } from './utils/logger.js';
import { logBuffer } from './utils/logBuffer.js';

// Initialize database
logger.info('Server', 'Initializing database...');
initializeDatabase();

// Initialize database performance configuration (after schema is ready)
import { initializeDatabaseConfig } from './database/dbConfig.js';
initializeDatabaseConfig();

// Initialize Wireshark vendor database (async, don't block startup)
import { WiresharkVendorService } from './services/wiresharkVendorService.js';
WiresharkVendorService.initialize().catch((error) => {
    logger.error('Server', 'Failed to initialize Wireshark vendor service:', error);
});

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

// Trust proxy - Required for correct IP detection in Docker/reverse proxy environments
// This allows Express to use X-Forwarded-For and X-Real-IP headers
app.set('trust proxy', true);

// Middleware - CORS Configuration
// Get CORS config from database, fallback to defaults
function getCorsConfig() {
  try {
    const corsConfigJson = AppConfigRepository.get('cors_config');
    if (corsConfigJson) {
      const corsConfig = JSON.parse(corsConfigJson);
      
      // Process allowedOrigins - convert regex strings to RegExp objects
      let origin: boolean | string[] | RegExp[] = corsConfig.allowedOrigins || true;
      if (Array.isArray(origin)) {
        const processedOrigin: (string | RegExp)[] = (origin as string[]).map((o: string): string | RegExp => {
          // Check if it's a regex pattern (starts and ends with /)
          if (typeof o === 'string' && o.startsWith('/') && o.endsWith('/')) {
            try {
              const pattern = o.slice(1, -1); // Remove leading and trailing /
              return new RegExp(pattern);
            } catch {
              return o; // If regex is invalid, return as string
            }
          }
          return o;
        });
        // Check if all are strings or all are RegExp
        const allStrings = processedOrigin.every(item => typeof item === 'string');
        const allRegExp = processedOrigin.every(item => item instanceof RegExp);
        if (allStrings) {
          origin = processedOrigin as string[];
        } else if (allRegExp) {
          origin = processedOrigin as RegExp[];
        } else {
          // Mixed types - keep as is (will be treated as string[] | RegExp[])
          origin = processedOrigin as string[] | RegExp[];
        }
      }
      
      return {
        origin: (typeof origin === 'string' && origin === '*') ? true : origin,
        credentials: corsConfig.allowCredentials !== undefined ? corsConfig.allowCredentials : true,
        methods: corsConfig.allowedMethods || ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
        allowedHeaders: corsConfig.allowedHeaders || ['Content-Type', 'Authorization', 'X-Requested-With']
      };
    }
  } catch (error) {
    logger.warn('Server', 'Failed to parse CORS config from database, using defaults:', error);
  }
  
  // Default CORS configuration
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
  
  return {
    origin: corsOrigin,
    credentials: true
  };
}

app.use(cors(getCorsConfig()));
app.use(express.json({ limit: '10mb' }));

// Metrics middleware (track all API requests)
import { metricsMiddleware } from './middleware/metricsMiddleware.js';
app.use(metricsMiddleware);

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
import searchRoutes from './routes/search.js';
import networkScanRoutes from './routes/network-scan.js';
import latencyMonitoringRoutes from './routes/latency-monitoring.js';
import databaseRoutes from './routes/database.js';
// Import network scan scheduler (initialized automatically when imported)
// The scheduler loads configs from database, so database must be initialized first
import './services/networkScanScheduler.js';
// Initialize latency monitoring scheduler
import { latencyMonitoringScheduler } from './services/latencyMonitoringScheduler.js';
// Initialize database purge service (loads configs from database)
import { initializePurgeService } from './services/databasePurgeService.js';

// Initialize database purge service (after database is initialized and routes are imported)
initializePurgeService();

// Initialize latency monitoring scheduler (after database is ready)
// Start with a small delay to ensure database is fully initialized
setTimeout(() => {
    try {
        latencyMonitoringScheduler.start();
        logger.success('Server', 'Latency monitoring scheduler initialized');
    } catch (error) {
        logger.error('Server', 'Failed to initialize latency monitoring scheduler:', error);
    }
}, 6000); // Wait 6 seconds for database to be ready

app.use('/api/users', usersRoutes);
app.use('/api/plugins', pluginsRoutes);
app.use('/api/logs', logsRoutes);
app.use('/api/config', configRoutes);
app.use('/api/metrics', metricsRoutes);
app.use('/api/docs', apiDocsRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/network-scan', networkScanRoutes);
app.use('/api/latency-monitoring', latencyMonitoringRoutes);
app.use('/api/database', databaseRoutes);

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
app.use('/api/security', securityRoutes);

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

// Log upgrade requests for debugging (only in verbose mode to reduce noise)
if (process.env.DEBUG_UPGRADE === 'true') {
server.on('upgrade', (request, socket, head) => {
  console.log('[HTTP] Upgrade request received:', request.url);
});
}

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

// Helper function to get host machine IP address when running in Docker
// First tries environment variable HOST_IP, then attempts to read from host filesystem
function getHostMachineIP(): string | null {
  // First priority: environment variable (most reliable)
  if (process.env.HOST_IP) {
    return process.env.HOST_IP;
  }
  
  // Second priority: try to read from host network interfaces
  const HOST_ROOT_PATH = process.env.HOST_ROOT_PATH || '/host';
  const routePath = path.join(HOST_ROOT_PATH, 'proc', 'net', 'route');
  
  try {
    // Method 1: Try to read IP addresses from /host/proc/net/route
    // Parse the route file to find the default gateway interface, then try to get its IP
    if (fsSync.existsSync(routePath)) {
      try {
        const routeContent = fsSync.readFileSync(routePath, 'utf8');
        const lines = routeContent.split('\n').filter(line => line.trim());
        
        // Find the default route (destination 00000000) to identify the main interface
        let defaultInterface: string | null = null;
        for (let i = 1; i < lines.length; i++) {
          const parts = lines[i].trim().split(/\s+/);
          if (parts.length >= 2) {
            const ifaceName = parts[0];
            const destination = parts[1];
            
            // Look for default route
            if (destination === '00000000') {
              // Skip virtual interfaces
              if (!ifaceName.startsWith('lo') && 
                  !ifaceName.startsWith('docker') && 
                  !ifaceName.startsWith('veth') &&
                  !ifaceName.startsWith('br-') &&
                  !ifaceName.startsWith('virbr')) {
                defaultInterface = ifaceName;
                break;
              }
            }
          }
        }
        
        // If we found a default interface, try to get its IP from network config files
        // or from /host/proc/net/if_inet6 for IPv6
        if (defaultInterface) {
          const ifacePath = path.join(HOST_ROOT_PATH, 'sys', 'class', 'net', defaultInterface);
          const operstatePath = path.join(ifacePath, 'operstate');
          
          // Check if interface is up
          if (fsSync.existsSync(operstatePath)) {
            const operstate = fsSync.readFileSync(operstatePath, 'utf8').trim();
            if (operstate === 'up') {
              // Try to read IPv6 address from /host/proc/net/if_inet6
              const inet6Path = path.join(HOST_ROOT_PATH, 'proc', 'net', 'if_inet6');
              if (fsSync.existsSync(inet6Path)) {
                try {
                  const inet6Content = fsSync.readFileSync(inet6Path, 'utf8');
                  const inet6Lines = inet6Content.split('\n').filter(line => line.trim());
                  
                  for (const line of inet6Lines) {
                    const parts = line.trim().split(/\s+/);
                    if (parts.length >= 6 && parts[5] === defaultInterface) {
                      // Found IPv6 address for this interface
                      // Convert from hex format to IPv6 address
                      const ipv6Hex = parts[0];
                      // Skip link-local addresses (fe80::)
                      if (!ipv6Hex.startsWith('fe80')) {
                        // Parse IPv6 hex to readable format (simplified)
                        // For now, we'll skip IPv6 and focus on IPv4
                      }
                    }
                  }
                } catch {
                  // Continue to next method
                }
              }
            }
          }
        }
      } catch (error) {
        // Continue to next method if route parsing fails
      }
    }
    
    // Method 2: Try to get IP from Docker gateway as a fallback
    // The Docker gateway IP (e.g., 172.17.0.1) is not the host's real IP,
    // but it's better than showing the container IP (172.18.0.2)
    // We can get this from the default route gateway
    // Reuse routePath declared at function level
    if (fsSync.existsSync(routePath)) {
      try {
        const routeContent = fsSync.readFileSync(routePath, 'utf8');
        const lines = routeContent.split('\n').filter(line => line.trim());
        
        for (let i = 1; i < lines.length; i++) {
          const parts = lines[i].trim().split(/\s+/);
          if (parts.length >= 3) {
            const destination = parts[1];
            const gateway = parts[2];
            
            // Look for default route (destination 00000000)
            if (destination === '00000000' && gateway !== '00000000') {
              // Convert gateway from hex to IP address
              // Format: hex string like "0101A8C0" -> "192.168.1.1"
              const gatewayHex = gateway;
              if (gatewayHex.length === 8) {
                const octet1 = parseInt(gatewayHex.substring(6, 8), 16);
                const octet2 = parseInt(gatewayHex.substring(4, 6), 16);
                const octet3 = parseInt(gatewayHex.substring(2, 4), 16);
                const octet4 = parseInt(gatewayHex.substring(0, 2), 16);
                const gatewayIP = `${octet1}.${octet2}.${octet3}.${octet4}`;
                
                // Return gateway IP (Docker bridge IP, e.g., 172.17.0.1)
                // This is not the host's real IP, but better than container IP
                return gatewayIP;
              }
            }
          }
        }
      } catch {
        // Fallback to null
      }
    }
    
  } catch (error) {
    // Fallback to null
  }
  
  // Return null to use container IP as fallback
  // Note: The most reliable way is to set HOST_IP environment variable in docker-compose.yml
  return null;
}

// Check JWT secret on startup and notify if default
const jwtSecret = process.env.JWT_SECRET || 'change-me-in-production-please-use-strong-secret';
if (jwtSecret === 'change-me-in-production-please-use-strong-secret') {
  securityNotificationService.notifyJwtSecretWarning().catch(err => {
    logger.error('Security', 'Failed to send JWT secret warning notification:', err);
  });
}

// Helper function to detect if running in Docker
const isDocker = (): boolean => {
  try {
    // Check /proc/self/cgroup (Linux)
    const cgroup = fsSync.readFileSync('/proc/self/cgroup', 'utf8');
    if (cgroup.includes('docker') || cgroup.includes('containerd')) {
      return true;
    }
  } catch {
    // Not Linux or file doesn't exist
  }
  
  // Check environment variable
  if (process.env.DOCKER === 'true' || process.env.DOCKER_CONTAINER === 'true') {
    return true;
  }
  
  // Check for .dockerenv file
  try {
    fsSync.accessSync('/.dockerenv');
    return true;
  } catch {
    return false;
  }
};

// Start server
const port = config.port;
const host = '0.0.0.0'; // Bind to all interfaces for Docker compatibility
server.listen(port, host, () => {
  // Determine environment type
  const isProduction = process.env.NODE_ENV === 'production';
  const isDockerEnv = isDocker();
  const isNpmDev = !isProduction && !isDockerEnv;
  const isDockerDev = !isProduction && isDockerEnv;
  const isDockerProd = isProduction && isDockerEnv;
  
  // Get container name - try multiple methods
  let containerName = 'MynetworK';
  if (isDockerEnv) {
    // Try environment variable first
    if (process.env.CONTAINER_NAME) {
      containerName = process.env.CONTAINER_NAME;
    } else {
      // Try to get from Docker hostname (container name)
      const hostname = os.hostname();
      // If hostname looks like a container ID (12 hex chars), try to get real container name
      if (hostname && hostname.length === 12 && /^[a-f0-9]+$/.test(hostname)) {
        // It's a container ID, use a default name based on environment
        containerName = isDockerDev ? 'Mynetwork-dev' : 'MynetworK';
      } else {
        // Use hostname as container name
        containerName = hostname;
      }
    }
  } else if (isNpmDev) {
    containerName = 'NPM DEV';
  }
  
  // Get host machine IP (for Docker) or container IP (for dev)
  const hostIP = isDockerEnv ? getHostMachineIP() : null;
  const containerIP = getNetworkIP();
  const displayIP = hostIP || containerIP || 'localhost';
  
  let frontendWebUrl: string;
  let frontendLocalUrl: string;
  let apiUrl: string;
  let wsUrl: string;
  
  if (isProduction) {
    // Production mode (Docker): check for configured domain first, then use host IP
    const dashboardPort = process.env.DASHBOARD_PORT || '7505';
    const publicUrl = getPublicUrl();
    
    if (publicUrl) {
      // Domain configured: use it for all URLs
      frontendWebUrl = publicUrl;
      frontendLocalUrl = publicUrl;
      apiUrl = publicUrl;
      wsUrl = publicUrl.replace(/^http/, 'ws') + '/ws/connection';
    } else if (hostIP) {
      // No domain configured: use host IP
      frontendWebUrl = `http://${hostIP}:${dashboardPort}`;
      frontendLocalUrl = frontendWebUrl;
      apiUrl = `http://${hostIP}:${dashboardPort}`;
      wsUrl = `ws://${hostIP}:${dashboardPort}/ws/connection`;
    } else {
      // Fallback: use container IP or localhost
      const fallbackIP = containerIP || 'localhost';
      frontendWebUrl = `http://${fallbackIP}:${dashboardPort}`;
      frontendLocalUrl = frontendWebUrl;
      apiUrl = `http://${fallbackIP}:${dashboardPort}`;
      wsUrl = `ws://${fallbackIP}:${dashboardPort}/ws/connection`;
    }
  } else if (isDockerDev) {
    // Docker dev mode: use host ports from docker-compose.dev.yml (DASHBOARD_PORT and SERVER_PORT)
    // These are the ports exposed on the host machine, not the container ports
    const dashboardPort = process.env.DASHBOARD_PORT || '3666'; // Host port for frontend
    const serverPort = process.env.SERVER_PORT || '3668'; // Host port for backend
    const networkIP = getNetworkIP();
    
    if (hostIP) {
      frontendWebUrl = `http://${hostIP}:${dashboardPort}`;
      frontendLocalUrl = `http://localhost:${dashboardPort}`;
      apiUrl = `http://${hostIP}:${serverPort}`;
      wsUrl = `ws://${hostIP}:${serverPort}/ws/connection`;
    } else if (networkIP) {
      frontendWebUrl = `http://${networkIP}:${dashboardPort}`;
      frontendLocalUrl = `http://localhost:${dashboardPort}`;
      apiUrl = `http://${networkIP}:${serverPort}`;
      wsUrl = `ws://${networkIP}:${serverPort}/ws/connection`;
    } else {
      frontendWebUrl = `http://localhost:${dashboardPort}`;
      frontendLocalUrl = frontendWebUrl;
      apiUrl = `http://localhost:${serverPort}`;
      wsUrl = `ws://localhost:${serverPort}/ws/connection`;
    }
  } else {
    // NPM dev mode: frontend is on Vite dev server, backend on configured port
    // Use environment variables if set, otherwise defaults
    // IMPORTANT: Use config.port (actual server port) not SERVER_PORT env var for display
    const vitePort = process.env.VITE_PORT || '5173';
    const actualServerPort = port.toString(); // Use the actual port the server is listening on
    const networkIP = getNetworkIP();
    
    frontendLocalUrl = `http://localhost:${vitePort}`;
    frontendWebUrl = networkIP ? `http://${networkIP}:${vitePort}` : frontendLocalUrl;
    apiUrl = `http://localhost:${actualServerPort}`;
    wsUrl = `ws://localhost:${actualServerPort}/ws/connection`;
  }
  
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

  // Read app version from package.json
  let appVersion = '0.1.0'; // Default fallback
  try {
    const packageJsonPath = path.join(__dirname, '..', 'package.json');
    const packageJson = JSON.parse(fsSync.readFileSync(packageJsonPath, 'utf8'));
    appVersion = packageJson.version || appVersion;
  } catch (error) {
    // If package.json can't be read, use default version
    console.warn('[Server] Could not read package.json version, using default');
  }

  // Calculate content widths for all lines
  const title = 'MynetworK Backend Server';
  const subtitle = 'Multi-Source Network Dashboard';
  
  // Determine version label based on environment
  let versionLabel: string;
  if (isNpmDev) {
    versionLabel = `NPM DEV v${appVersion}`;
  } else if (isDockerDev) {
    versionLabel = `Docker DEV v${appVersion}`;
  } else if (isDockerProd) {
    versionLabel = `Version v${appVersion}`;
  } else {
    versionLabel = `DEV v${appVersion}`;
  }
  
  const containerLabel = `📦 Container:            ${containerName}`;
  
  // Align URLs with consistent spacing
  const maxLabelLength = Math.max(
    'Frontend WEB'.length,
    'Frontend Local'.length,
    'Backend API'.length,
    'WebSocket'.length,
    'Freebox'.length
  );
  
  const padLabel = (label: string): string => {
    return label.padEnd(maxLabelLength);
  };
  
  const contentLines = [
    containerLabel,
    `  🌐 ${padLabel('Frontend WEB')}: ${frontendWebUrl}`,
    `  💻 ${padLabel('Frontend Local')}: ${frontendLocalUrl}`,
    `  🔌 ${padLabel('Backend API')}: ${apiUrl}/api/health`,
    `  🔗 ${padLabel('WebSocket')}: ${wsUrl}`,
    `  📡 ${padLabel('Freebox')}: ${config.freebox.url}`,
    `  Features:`,
    `  ✓ User Authentication (JWT)`,
    `  ✓ Plugin System (Freebox, UniFi, Search devices, Scan network...)`,
    `  ✓ Activity Logging`
  ];
  
  // Find the longest line (visible length)
  const maxContentWidth = Math.max(
    ...contentLines.map(line => visibleLength(line)),
    visibleLength(title),
    visibleLength(subtitle),
    visibleLength(versionLabel),
    visibleLength(containerLabel)
  );
  
  // Calculate total width: content + minimal padding (4 chars)
  // Minimum width of 60 for readability
  const width = Math.max(maxContentWidth + 4, 60);
  const minPadding = 2;
  
  // Calculate padding for centered titles (no border on right, so no -2)
  const titlePadding = Math.max(Math.floor((width - visibleLength(title)) / 2), minPadding);
  const subtitlePadding = Math.max(Math.floor((width - visibleLength(subtitle)) / 2), minPadding);
  const versionPadding = Math.max(Math.floor((width - visibleLength(versionLabel)) / 2), minPadding);
  
  // Helper to pad content lines
  const padLine = (line: string, label: string, value: string): string => {
    const labelVisible = visibleLength(label);
    const valueVisible = visibleLength(value);
    const totalVisible = visibleLength(line);
    const padding = Math.max(width - totalVisible - 2, 0);
    return line + ' '.repeat(padding);
  };

  // Calculate padding for container label
  const containerPadding = Math.max(Math.floor((width - visibleLength(containerLabel)) / 2), minPadding);
  
  // Display header in console (with colors)
  console.log(`
${colors.bright}${colors.cyan}╔${'═'.repeat(width)}${colors.reset}
${colors.bright}${colors.cyan}║${' '.repeat(titlePadding)}${colors.white}${colors.bright}${title}${colors.reset}${' '.repeat(width - titlePadding - visibleLength(title))}${colors.reset}
${colors.bright}${colors.cyan}║${' '.repeat(subtitlePadding)}${colors.dim}${subtitle}${colors.reset}${' '.repeat(width - subtitlePadding - visibleLength(subtitle))}${colors.reset}
${colors.bright}${colors.cyan}╠${'═'.repeat(width)}${colors.reset}
${colors.bright}${colors.cyan}║${' '.repeat(versionPadding)}${isDockerProd ? colors.yellow : (isNpmDev || isDockerDev ? colors.bright : colors.bright)}${colors.green}${colors.bright}${versionLabel}${colors.reset}${' '.repeat(width - versionPadding - visibleLength(versionLabel))}${colors.reset}
${colors.bright}${colors.cyan}║${colors.reset}  ${colors.cyan}📦${colors.reset} ${colors.bright}Container:${colors.reset}           ${colors.cyan}${containerName}${colors.reset}${colors.reset}
${colors.bright}${colors.cyan}╠${'═'.repeat(width)}${colors.reset}
${colors.bright}${colors.cyan}║${colors.reset}  ${colors.green}🌐${colors.reset} ${colors.bright}${padLabel('Frontend WEB')}:${colors.reset} ${colors.cyan}${frontendWebUrl}${colors.reset}${colors.reset}
${colors.bright}${colors.cyan}║${colors.reset}  ${colors.blue}💻${colors.reset} ${colors.bright}${padLabel('Frontend Local')}:${colors.reset} ${colors.cyan}${frontendLocalUrl}${colors.reset}${colors.reset}
${colors.bright}${colors.cyan}║${colors.reset}  ${colors.yellow}🔌${colors.reset} ${colors.bright}${padLabel('Backend API')}:${colors.reset} ${colors.cyan}${apiUrl}/api/health${colors.reset}${colors.reset}
${colors.bright}${colors.cyan}║${colors.reset}  ${colors.magenta}🔗${colors.reset} ${colors.bright}${padLabel('WebSocket')}:${colors.reset} ${colors.cyan}${wsUrl}${colors.reset}${colors.reset}
${colors.bright}${colors.cyan}║${colors.reset}  ${colors.cyan}📡${colors.reset} ${colors.bright}${padLabel('Freebox')}:${colors.reset} ${colors.cyan}${config.freebox.url}${colors.reset}${colors.reset}
${colors.bright}${colors.cyan}║${colors.reset}${colors.reset}
${colors.bright}${colors.cyan}║${colors.reset}  ${colors.bright}${colors.white}Features:${colors.reset}${colors.reset}
${colors.bright}${colors.cyan}║${colors.reset}  ${colors.dim}${colors.green}✓${colors.reset} ${colors.dim}User Authentication (JWT)${colors.reset}${colors.reset}
${colors.bright}${colors.cyan}║${colors.reset}  ${colors.dim}${colors.green}✓${colors.reset} ${colors.dim}Plugin System (Freebox, UniFi, Search devices, Scan network...)${colors.reset}${colors.reset}
${colors.bright}${colors.cyan}║${colors.reset}  ${colors.dim}${colors.green}✓${colors.reset} ${colors.dim}Activity Logging${colors.reset}${colors.reset}
${colors.bright}${colors.cyan}╚${'═'.repeat(width)}${colors.reset}
  `);
  
  // Add header to log buffer (without ANSI codes for cleaner display in logs)
  const headerLines = [
    `╔${'═'.repeat(width)}`,
    `║${' '.repeat(titlePadding)}${title}${' '.repeat(width - titlePadding - visibleLength(title))}`,
    `║${' '.repeat(subtitlePadding)}${subtitle}${' '.repeat(width - subtitlePadding - visibleLength(subtitle))}`,
    `╠${'═'.repeat(width)}`,
    `║${' '.repeat(versionPadding)}${versionLabel}${' '.repeat(width - versionPadding - visibleLength(versionLabel))}`,
    `║  📦 Container:            ${containerName}`,
    `╠${'═'.repeat(width)}`,
    `║  🌐 ${padLabel('Frontend WEB')}: ${frontendWebUrl}`,
    `║  💻 ${padLabel('Frontend Local')}: ${frontendLocalUrl}`,
    `║  🔌 ${padLabel('Backend API')}: ${apiUrl}/api/health`,
    `║  🔗 ${padLabel('WebSocket')}: ${wsUrl}`,
    `║  📡 ${padLabel('Freebox')}: ${config.freebox.url}`,
    `║`,
    `║  Features:`,
    `║  ✓ User Authentication (JWT)`,
    `║  ✓ Plugin System (Freebox, UniFi, Search devices, Scan network...)`,
    `║  ✓ Activity Logging`,
    `╚${'═'.repeat(width)}`
  ];
  
  // Add each line of the header to the log buffer
  headerLines.forEach(line => {
    logBuffer.add('info', 'Server', line.trim());
  });
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
