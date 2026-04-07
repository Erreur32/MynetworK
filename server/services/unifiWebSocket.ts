import { WebSocketServer, WebSocket } from 'ws';
import type { WebSocket as WsType } from 'ws';
import { pluginManager } from './pluginManager.js';
import { logger } from '../utils/logger.js';

type ClientWebSocket = WsType & { isAlive?: boolean };

const UNIFI_POLLING_INTERVAL = 3000; // 3 seconds

class UnifiWebSocketService {
  private wss: WebSocketServer | null = null;
  private pollingInterval: NodeJS.Timeout | null = null;
  private pingInterval: NodeJS.Timeout | null = null;

  getWss(): WebSocketServer | null { return this.wss; }

  init(server: import('http').Server) {
    logger.info('WS-UniFi', 'Initializing UniFi WebSocket server...');

    this.wss = new WebSocketServer({
      noServer: true,
      perMessageDeflate: false,
      clientTracking: true,
    });

    this.wss.on('error', (error) => {
      logger.error('WS-UniFi', 'Server error:', error);
    });

    this.wss.on('connection', (ws: ClientWebSocket, req) => {
      const clientAddress = req.socket.remoteAddress || 'unknown';
      logger.debug('WS-UniFi', `Client connected from ${clientAddress} (total: ${this.wss?.clients.size || 0})`);

      ws.isAlive = true;

      ws.on('pong', () => { ws.isAlive = true; });

      ws.on('close', () => {
        logger.debug('WS-UniFi', `Client disconnected (remaining: ${this.wss?.clients.size || 0})`);
        if (this.wss && this.wss.clients.size === 0) {
          this.stopPolling();
        }
      });

      ws.on('error', (error) => {
        if (process.env.NODE_ENV === 'development') {
          logger.error('WS-UniFi', `Client error:`, error.message || String(error));
        }
      });

      // Start polling when first client connects
      if (this.wss && this.wss.clients.size === 1) {
        setTimeout(() => {
          if (this.wss && this.wss.clients.size > 0) {
            let hasOpenClient = false;
            this.wss.clients.forEach((client) => {
              if (client.readyState === WebSocket.OPEN) hasOpenClient = true;
            });
            if (hasOpenClient) {
              logger.debug('WS-UniFi', 'Starting bandwidth polling (3s)');
              this.startPolling();
            }
          }
        }, 1000);
      }
    });

    // Ping interval for stale connection detection
    setTimeout(() => {
      this.pingInterval = setInterval(() => {
        if (!this.wss) return;
        this.wss.clients.forEach((ws) => {
          const client = ws as ClientWebSocket;
          if (client.readyState !== WebSocket.OPEN) return;
          if (client.isAlive === false) {
            logger.debug('WS-UniFi', 'Terminating stale client');
            return client.terminate();
          }
          client.isAlive = false;
          try { client.ping(); } catch { /* ignore */ }
        });
      }, 30000);
    }, 5000);

    logger.info('WS-UniFi', 'WebSocket server initialized on /ws/unifi');
  }

  private startPolling() {
    if (this.pollingInterval) return;

    this.pollingInterval = setInterval(() => {
      this.fetchAndBroadcast();
    }, UNIFI_POLLING_INTERVAL);

    this.fetchAndBroadcast();
  }

  private stopPolling() {
    if (this.pollingInterval) {
      logger.debug('WS-UniFi', 'Stopping bandwidth polling');
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  private async fetchAndBroadcast() {
    if (!this.wss || this.wss.clients.size === 0) return;

    const unifiPlugin = pluginManager.getPlugin('unifi');
    if (!unifiPlugin || !unifiPlugin.isEnabled()) return;

    try {
      const pluginAny = unifiPlugin as any;
      if (typeof pluginAny.fetchWanBandwidth !== 'function') return;

      const wanData = await pluginAny.fetchWanBandwidth();
      if (!wanData) return;

      const primaryWan = wanData['wan1'] || { download: 0, upload: 0 };

      const message = JSON.stringify({
        type: 'unifi_bandwidth',
        data: {
          timestamp: Date.now(),
          download: primaryWan.download, // KB/s
          upload: primaryWan.upload,     // KB/s
          wans: wanData,
        }
      });

      this.wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          try { client.send(message); } catch { /* ignore */ }
        }
      });
    } catch (error) {
      logger.debug('WS-UniFi', 'fetchAndBroadcast error:', error);
    }
  }

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
    logger.debug('WS-UniFi', 'WebSocket service closed');
  }
}

export const unifiWebSocket = new UnifiWebSocketService();
