import { WebSocketServer, WebSocket } from 'ws';
import type { WebSocket as WsType } from 'ws';
import { freeboxApi } from './freeboxApi.js';
import { normalizeSystemInfo } from './apiNormalizer.js';
import { logger } from '../utils/logger.js';

interface ConnectionStatus {
  type: string;
  state: string;
  media: string;
  ipv4: string;
  ipv4_port_range: [number, number];
  ipv6: string;
  rate_down: number;
  rate_up: number;
  bandwidth_down: number;
  bandwidth_up: number;
  bytes_down: number;
  bytes_up: number;
}

interface SystemStatus {
  temp_cpu0?: number;
  temp_cpu1?: number;
  temp_cpu2?: number;
  temp_cpu3?: number;
  temp_cpum?: number;
  temp_cpub?: number;
  temp_sw?: number;
  fan_rpm?: number;
  uptime_val?: number;
}

type ClientWebSocket = WsType & { isAlive?: boolean };

// Polling intervals aligned with Freebox session keep-alive (2 minutes)
// Connection status: poll every 1 second for real-time bandwidth data
// System status: poll every 10 seconds (less frequent, aligned with keep-alive check)
const CONNECTION_POLLING_INTERVAL = 1000; // 1 second for real-time connection data (bandwidth)
const SYSTEM_POLLING_INTERVAL = 10000; // 10 seconds for system data (less frequent, aligned with session keep-alive)

class ConnectionWebSocketService {
  private wss: WebSocketServer | null = null;
  private connectionPollingInterval: NodeJS.Timeout | null = null;
  private systemPollingInterval: NodeJS.Timeout | null = null;
  private pingInterval: NodeJS.Timeout | null = null;

  /**
   * Initialize the WebSocket server
   */
  init(server: import('http').Server) {
    logger.info('WS', 'Initializing WebSocket server...');

    // Configure WebSocket server with options to handle Docker/network issues
    this.wss = new WebSocketServer({ 
      server, 
      path: '/ws/connection',
      // Disable per-message deflate to avoid compression issues
      perMessageDeflate: false,
      // Ensure client tracking is enabled
      clientTracking: true,
      // Handle upgrade requests properly
      verifyClient: (info) => {
        // Log connection attempt for debugging
        logger.debug('WS', `Verifying client connection from: ${info.origin || 'unknown'}`);
        return true; // Accept all connections
      }
    });

    logger.info('WS', 'WebSocket server created on path /ws/connection');

    this.wss.on('error', (error) => {
      logger.error('WS', 'Server error:', error);
    });

    this.wss.on('connection', (ws: ClientWebSocket, req) => {
      const clientAddress = req.socket.remoteAddress || 'unknown';
      const headers = req.headers;
      
      // Log connection details with headers for debugging
      logger.info('WS', `Client connected from: ${clientAddress}`);
      logger.info('WS', `Total clients: ${this.wss?.clients.size || 0}`);
      logger.info('WS', `Request URL: ${req.url}`);
      logger.info('WS', `Request method: ${req.method}`);
      logger.info('WS', `WebSocket readyState: ${ws.readyState} (0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED)`);
      logger.info('WS', `Headers:`, JSON.stringify({
        'upgrade': headers.upgrade,
        'connection': headers.connection,
        'sec-websocket-key': headers['sec-websocket-key'] ? 'present' : 'missing',
        'sec-websocket-version': headers['sec-websocket-version'],
        'sec-websocket-protocol': headers['sec-websocket-protocol'],
        'origin': headers.origin,
        'host': headers.host,
        'user-agent': headers['user-agent']?.substring(0, 50) + '...'
      }, null, 2));
      
      ws.isAlive = true;
      
      // Wait a bit and verify connection is still open before doing anything
      setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
          logger.info('WS', `Connection from ${clientAddress} is stable after initial delay`);
        } else {
          logger.warn('WS', `Connection from ${clientAddress} is not open (state: ${ws.readyState})`);
        }
      }, 100);

      ws.on('pong', () => {
        ws.isAlive = true;
        logger.debug('WS', `Received pong from ${clientAddress}`);
      });

      ws.on('close', (code, reason) => {
        logger.info('WS', `Client disconnected from ${clientAddress}: code=${code}, reason=${reason.toString()}, remaining clients: ${this.wss?.clients.size || 0}`);
        // Stop polling if no more clients
        if (this.wss && this.wss.clients.size === 0) {
          this.stopPolling();
        }
      });

      ws.on('error', (error) => {
        // Log all errors in dev mode for debugging
        if (process.env.NODE_ENV === 'development') {
          logger.error('WS', `Client error from ${clientAddress}:`, error.message || String(error));
        } else {
          // Only log non-socket errors to avoid spam in production
        if (error.message && !error.message.includes('socket') && !error.message.includes('ECONNRESET')) {
          logger.error('WS', `Client error: ${error.message}`);
          }
        }
      });

      // Start polling if this is the first client, but wait for connection to be ready
      // Add a delay to prevent "Invalid frame header" errors when data is sent too quickly
      // The delay needs to be longer to ensure the WebSocket handshake is fully complete
      // Also wait for the client to be fully ready (not just connected)
      if (this.wss && this.wss.clients.size === 1) {
        // Wait longer and verify connection is stable before starting polling
        setTimeout(() => {
          // Double-check that we still have clients and they are in OPEN state
          if (this.wss && this.wss.clients.size > 0) {
            let hasOpenClient = false;
            this.wss.clients.forEach((client) => {
              if (client.readyState === WebSocket.OPEN) {
                hasOpenClient = true;
              }
            });
            if (hasOpenClient) {
              logger.info('WS', 'Starting polling after connection stabilization');
        this.startPolling();
            } else {
              logger.warn('WS', 'No open clients found, skipping polling start');
            }
          }
        }, 1000); // Increased to 1 second to ensure WebSocket handshake is fully complete and stable
      }
    });

    // Ping clients to detect stale connections
    // Start ping interval after a longer delay to avoid sending pings too early
    // Increased delay to ensure WebSocket connection is fully stable
    setTimeout(() => {
    this.pingInterval = setInterval(() => {
        if (!this.wss) return;
        
        this.wss.clients.forEach((ws) => {
        const client = ws as ClientWebSocket;
          // Only ping clients that are in OPEN state and have been connected for a while
          if (client.readyState !== WebSocket.OPEN) {
            return;
          }
        if (client.isAlive === false) {
            logger.info('WS', 'Terminating stale client connection');
          return client.terminate();
        }
        client.isAlive = false;
          try {
        client.ping();
          } catch (error) {
            // Log ping errors in dev mode
            if (process.env.NODE_ENV === 'development') {
              logger.error('WS', `Error pinging client:`, error instanceof Error ? error.message : String(error));
            }
          }
      });
      }, 30000); // Ping every 30 seconds
    }, 5000); // Wait 5 seconds before starting ping interval to ensure connection is stable

    logger.info('WS', 'WebSocket server initialized on /ws/connection');
  }

  /**
   * Start polling Freebox API for connection and system status
   */
  private startPolling() {
    if (this.connectionPollingInterval) return;

    logger.debug('WS', 'Starting connection and system status polling');

    // Connection status polling (every 1 second)
    this.connectionPollingInterval = setInterval(async () => {
      await this.fetchConnectionAndBroadcast();
    }, CONNECTION_POLLING_INTERVAL);

    // System status polling (every 5 seconds)
    this.systemPollingInterval = setInterval(async () => {
      await this.fetchSystemAndBroadcast();
    }, SYSTEM_POLLING_INTERVAL);

    // Fetch immediately
    this.fetchConnectionAndBroadcast();
    this.fetchSystemAndBroadcast();
  }

  /**
   * Stop polling
   */
  private stopPolling() {
    if (this.connectionPollingInterval) {
      logger.debug('WS', 'Stopping connection status polling');
      clearInterval(this.connectionPollingInterval);
      this.connectionPollingInterval = null;
    }
    if (this.systemPollingInterval) {
      logger.debug('WS', 'Stopping system status polling');
      clearInterval(this.systemPollingInterval);
      this.systemPollingInterval = null;
    }
  }

  /**
   * Fetch connection status from Freebox and broadcast to clients
   * Checks session validity before fetching to avoid errors when session expires
   */
  private async fetchConnectionAndBroadcast() {
    if (!this.wss || this.wss.clients.size === 0) return;
    
    // Check if Freebox session is still valid before fetching
    // This prevents errors when session expires (keep-alive checks every 2 minutes)
    if (!freeboxApi.isLoggedIn()) {
      // Session expired, stop polling until session is restored
      // The keep-alive mechanism will restore the session automatically
      return;
    }

    try {
      const response = await freeboxApi.getConnectionStatus();
      if (response.success && response.result) {
        // Only send to clients that are in OPEN state
        this.broadcast('connection_status', response.result as ConnectionStatus, true);
      }
    } catch (error) {
      // If error is due to invalid session, stop polling
      // The keep-alive will restore the session and polling will resume
      if (error instanceof Error && (error.message.includes('session') || error.message.includes('unauthorized'))) {
        // Session expired, stop polling
        return;
      }
      // Silent fail for other errors - don't spam logs
    }
  }

  /**
   * Fetch system status from Freebox and broadcast to clients
   * Checks session validity before fetching to avoid errors when session expires
   */
  private async fetchSystemAndBroadcast() {
    if (!this.wss || this.wss.clients.size === 0) return;
    
    // Check if Freebox session is still valid before fetching
    // This prevents errors when session expires (keep-alive checks every 2 minutes)
    if (!freeboxApi.isLoggedIn()) {
      // Session expired, stop polling until session is restored
      // The keep-alive mechanism will restore the session automatically
      return;
    }

    try {
      const response = await freeboxApi.getSystemInfo();
      if (response.success && response.result) {
        // Use API normalizer for automatic compatibility with all Freebox models
        const normalized = normalizeSystemInfo(response.result as Record<string, unknown>);

        const systemStatus: SystemStatus = {
          temp_cpu0: normalized.temp_cpu0,
          temp_cpu1: normalized.temp_cpu1,
          temp_cpu2: normalized.temp_cpu2,
          temp_cpu3: normalized.temp_cpu3,
          temp_cpum: normalized.temp_cpum,
          temp_cpub: normalized.temp_cpub,
          temp_sw: normalized.temp_sw,
          fan_rpm: normalized.fan_rpm,
          uptime_val: normalized.uptime_val as number | undefined
        };

        this.broadcast('system_status', systemStatus);
      }
    } catch (error) {
      // If error is due to invalid session, stop polling
      // The keep-alive will restore the session and polling will resume
      if (error instanceof Error && (error.message.includes('session') || error.message.includes('unauthorized'))) {
        // Session expired, stop polling
        return;
      }
      // Silent fail for other errors - don't spam logs
    }
  }

  /**
   * Broadcast message to all connected clients
   */
  private broadcast(type: string, data: ConnectionStatus | SystemStatus, checkReadyState: boolean = false) {
    if (!this.wss) return;

    try {
    const message = JSON.stringify({ type, data });
      
      // Validate message size (max 1MB to prevent issues)
      const MAX_MESSAGE_SIZE = 1024 * 1024; // 1MB
      if (message.length > MAX_MESSAGE_SIZE) {
        logger.warn('WS', `Message too large (${message.length} bytes), skipping broadcast`);
        return;
      }

    this.wss.clients.forEach((client) => {
        // Double check readyState if requested (for extra safety)
        if (checkReadyState && client.readyState !== WebSocket.OPEN) {
          return;
        }
      if (client.readyState === WebSocket.OPEN) {
          try {
        client.send(message);
          } catch (error) {
            // Log send errors in dev mode for debugging
            if (process.env.NODE_ENV === 'development') {
              logger.error('WS', `Error sending message to client:`, error instanceof Error ? error.message : String(error));
            }
          }
      }
    });
    } catch (error) {
      // Log JSON stringify errors
      logger.error('WS', `Error stringifying message:`, error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Broadcast Freebox native WebSocket event to all dashboard clients
   * Used by freeboxNativeWebSocket service to relay events
   */
  broadcastFreeboxEvent(eventType: string, data: Record<string, unknown>) {
    if (!this.wss) return;

    const message = JSON.stringify({
      type: 'freebox_event',
      eventType,
      data
    });

    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  /**
   * Close WebSocket server and stop polling
   */
  close() {
    this.stopPolling();

    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }

    logger.debug('WS', 'WebSocket service closed');
  }

  /**
   * Called when user logs in - start polling if clients connected
   */
  onLogin() {
    if (this.wss && this.wss.clients.size > 0) {
      this.startPolling();
    }
  }

  /**
   * Called when user logs out - stop polling
   */
  onLogout() {
    this.stopPolling();
  }
}

export const connectionWebSocket = new ConnectionWebSocketService();
