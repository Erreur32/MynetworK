import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Determine token file path:
// 1. Use FREEBOX_TOKEN_FILE env var if set (Docker/production) - highest priority
// 2. If NODE_ENV=development, use data/freebox_token.json to share with Docker dev
// 3. If running in Docker (/app directory), use /app/data/freebox_token.json as default
// 4. Otherwise use .freebox_token in project root (production or undefined)
const getTokenFilePath = (): string => {
  if (process.env.FREEBOX_TOKEN_FILE) {
    return process.env.FREEBOX_TOKEN_FILE;
  }
  
  // In development (npm run dev), use data/freebox_token.json to share with Docker dev
  // This allows using the same token between npm run dev and docker-compose dev
  const isDevelopment = process.env.NODE_ENV === 'development';
  if (isDevelopment) {
    // Find project root by looking for package.json (more reliable than __dirname)
    // This ensures the path is correct even when running with tsx watch
    let projectRoot = process.cwd();
    let currentDir = process.cwd();
    const maxDepth = 10;
    let depth = 0;
    
    // Find project root by looking for package.json
    while (depth < maxDepth && currentDir !== path.dirname(currentDir)) {
      if (fs.existsSync(path.join(currentDir, 'package.json'))) {
        projectRoot = currentDir;
        break;
      }
      currentDir = path.dirname(currentDir);
      depth++;
    }
    
    // Force absolute path from project root
    const tokenPath = path.resolve(projectRoot, 'data', 'freebox_token.json');
    console.log(`[Config] Development mode - Token path: ${tokenPath} (projectRoot: ${projectRoot})`);
    return tokenPath;
  }
  
  // Check if running in Docker (working directory is /app)
  const cwd = process.cwd();
  if (cwd === '/app' || cwd.startsWith('/app/')) {
    // Docker production: use /app/data/freebox_token.json as default
    return '/app/data/freebox_token.json';
  }
  
  // Production: use .freebox_token in project root
  // Also find project root for consistency
  let projectRootProd = process.cwd();
  let currentDirProd = process.cwd();
  const maxDepthProd = 10;
  let depthProd = 0;
  
  while (depthProd < maxDepthProd && currentDirProd !== path.dirname(currentDirProd)) {
    if (fs.existsSync(path.join(currentDirProd, 'package.json'))) {
      projectRootProd = currentDirProd;
      break;
    }
    currentDirProd = path.dirname(currentDirProd);
    depthProd++;
  }
  
  return path.resolve(projectRootProd, '.freebox_token');
};

// Server configuration
export const config = {
  // Server
  // Default port: 3000 for production (Docker), 3003 for development
  port: parseInt(
    process.env.PORT || 
    process.env.SERVER_PORT || 
    (process.env.NODE_ENV === 'production' ? '3000' : '3003'), 
    10
  ),
  // Public URL for frontend access (used in logs and WebSocket URLs)
  // Priority: 1. Database config, 2. Environment variable, 3. null
  // Note: Use getPublicUrl() function to get the value (reads from DB if available)
  publicUrl: process.env.PUBLIC_URL || process.env.DASHBOARD_URL || null,

  // Freebox API
  freebox: {
    // Default URLs - can be overridden by env vars
    // FREEBOX_HOST allows setting just the hostname (used by Docker)
    url: process.env.FREEBOX_URL || `https://${process.env.FREEBOX_HOST || 'mafreebox.freebox.fr'}`,
    localIp: process.env.FREEBOX_LOCAL_IP || '192.168.1.254',

    // App registration details
    appId: process.env.FREEBOX_APP_ID || 'fr.mynetwork.dashboard',
    appName: process.env.FREEBOX_APP_NAME || 'MynetworK Dashboard',
    appVersion: process.env.FREEBOX_APP_VERSION || '2.0.0',
    deviceName: process.env.FREEBOX_DEVICE_NAME || 'MynetworK Web App',

    // API version - v14 is used as default for broader compatibility
    // v14: Supported by all current models (Ultra, Delta, Pop, Revolution, Mini 4K)
    // v15: Latest version with pagination support for file listing
    // Can be overridden via FREEBOX_API_VERSION env var
    apiVersion: process.env.FREEBOX_API_VERSION || 'v14',

    // Timeouts
    // #region agent log
    // Note: Timeout value logged at request time in freeboxApi.ts
    // #endregion
    requestTimeout: 10000,

    // Token storage file path (absolute path for Docker compatibility)
    tokenFile: getTokenFilePath()
  }
};

/**
 * Get public URL with priority: Database > Environment variable > null
 * This function should be used instead of config.publicUrl to get the current value
 */
export const getPublicUrl = (): string | null => {
  try {
    // Try to get from database (if available)
    const { AppConfigRepository } = require('./database/models/AppConfig.js');
    const dbValue = AppConfigRepository.get('public_url');
    if (dbValue) return dbValue;
  } catch {
    // If AppConfigRepository is not available yet, fall back to env
  }
  return process.env.PUBLIC_URL || process.env.DASHBOARD_URL || config.publicUrl || null;
};

// API endpoints
export const API_ENDPOINTS = {
  // API Version (no auth required)
  API_VERSION: '/api_version',

  // Auth
  LOGIN: '/login/',
  LOGIN_AUTHORIZE: '/login/authorize/',
  LOGIN_SESSION: '/login/session/',
  LOGIN_LOGOUT: '/login/logout/',

  // System
  SYSTEM: '/system/',
  SYSTEM_REBOOT: '/system/reboot/',

  // Connection
  CONNECTION: '/connection/',
  CONNECTION_CONFIG: '/connection/config/',
  CONNECTION_IPV6: '/connection/ipv6/config/',
  CONNECTION_LOGS: '/connection/logs/',
  CONNECTION_XDSL: '/connection/xdsl/',
  CONNECTION_FTTH: '/connection/ftth/',

  // RRD (monitoring data)
  RRD: '/rrd/',

  // WiFi
  WIFI_CONFIG: '/wifi/config/',
  WIFI_AP: '/wifi/ap/',
  WIFI_BSS: '/wifi/bss/',
  WIFI_STATIONS: '/wifi/stations/',
  WIFI_MAC_FILTER: '/wifi/mac_filter/',
  WIFI_PLANNING: '/wifi/planning/',
  WIFI_WPS: '/wifi/wps/',
  WIFI_TEMP_DISABLE: '/wifi/temp_disable/',  // v13.0 - Temporarily disable WiFi
  WIFI_CUSTOM_KEY: '/wifi/custom_key/',      // v14.0 - Guest network configuration
  WIFI_MLO_CONFIG: '/wifi/mlo/config/',      // v14.0 - Multi Link Operation (WiFi 7)

  // LAN
  LAN_CONFIG: '/lan/config/',
  LAN_BROWSER: '/lan/browser/interfaces/',
  LAN_WOL: '/lan/wol/',

  // DHCP
  DHCP_CONFIG: '/dhcp/config/',
  DHCP_STATIC_LEASES: '/dhcp/static_lease/',
  DHCP_DYNAMIC_LEASES: '/dhcp/dynamic_lease/',

  // Downloads
  DOWNLOADS: '/downloads/',
  DOWNLOADS_STATS: '/downloads/stats/',
  DOWNLOADS_ADD: '/downloads/add/',
  DOWNLOADS_CONFIG: '/downloads/config/',

  // File System
  FS_LIST: '/fs/ls/',
  FS_INFO: '/fs/info/',
  FS_MKDIR: '/fs/mkdir/',
  FS_RENAME: '/fs/rename/',
  FS_REMOVE: '/fs/rm/',
  FS_COPY: '/fs/cp/',
  FS_MOVE: '/fs/mv/',
  FS_HASH: '/fs/hash/',
  FS_DOWNLOAD: '/dl/',

  // Storage
  STORAGE_DISK: '/storage/disk/',
  STORAGE_PARTITION: '/storage/partition/',
  STORAGE_CONFIG: '/storage/config/',

  // Shares
  SHARE_LINK: '/share_link/',

  // Phone / Calls
  CALL_LOG: '/call/log/',
  CALL_LOG_DELETE: '/call/log/delete_all/',
  CALL_LOG_MARK_READ: '/call/log/mark_all_as_read/',

  // Contacts
  CONTACTS: '/contact/',
  CONTACTS_NUMBERS: '/number/',

  // PVR (TV Recording)
  PVR_CONFIG: '/pvr/config/',
  PVR_PROGRAMMED: '/pvr/programmed/',
  PVR_FINISHED: '/pvr/finished/',
  PVR_MEDIA: '/pvr/media/',

  // TV
  TV_CHANNELS: '/tv/channels/',
  TV_BOUQUETS: '/tv/bouquets/',
  TV_EPG_BY_TIME: '/tv/epg/by_time/',

  // Parental Control
  PARENTAL_CONFIG: '/parental/config/',
  PARENTAL_FILTER: '/parental/filter/',

  // Profiles (Network Access)
  PROFILE: '/profile/',
  PROFILE_NETWORK_CONTROL: '/network_control/',

  // VPN Server
  VPN_SERVER_CONFIG: '/vpn/config/',
  VPN_SERVER_USERS: '/vpn/user/',
  VPN_SERVER_CONNECTIONS: '/vpn/connection/',
  VPN_SERVER_IP_POOL: '/vpn/ip_pool/',

  // VPN Client
  VPN_CLIENT_CONFIG: '/vpn_client/config/',
  VPN_CLIENT_CONFIGS: '/vpn_client/',
  VPN_CLIENT_STATUS: '/vpn_client/status/',

  // FTP
  FTP_CONFIG: '/ftp/config/',

  // NAT / Port Forwarding
  NAT_DMZCONFIG: '/fw/dmz/',
  NAT_PORT_FORWARDING: '/fw/redir/',
  NAT_INCOMING: '/fw/incoming/',

  // UPnP IGD
  UPNP_IGD_CONFIG: '/upnpigd/config/',
  UPNP_IGD_REDIRECTIONS: '/upnpigd/redir/',

  // LCD Display
  LCD_CONFIG: '/lcd/config/',

  // Freeplug
  FREEPLUG: '/freeplug/',

  // Switch (ports)
  SWITCH_STATUS: '/switch/status/',
  SWITCH_PORT: '/switch/port/',

  // VM (may not be available on all models)
  VM: '/vm/',
  VM_INFO: '/vm/info/',
  VM_DISTROS: '/vm/distros/',

  // AirMedia
  AIRMEDIA_CONFIG: '/airmedia/config/',
  AIRMEDIA_RECEIVERS: '/airmedia/receivers/',

  // Notifications
  NOTIFICATIONS: '/notifications/'
};
