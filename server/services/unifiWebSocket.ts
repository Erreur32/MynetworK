import { WebSocketServer, WebSocket } from 'ws';
import type { WebSocket as WsType } from 'ws';
import { pluginManager } from './pluginManager.js';
import { logger } from '../utils/logger.js';

type ClientWebSocket = WsType & { isAlive?: boolean };

const UNIFI_POLLING_INTERVAL = 1000; // 1 second — live mode

class UnifiWebSocketService {
  private wss: WebSocketServer | null = null;
  private pollingInterval: NodeJS.Timeout | null = null;
  private pingInterval: NodeJS.Timeout | null = null;

  getWss(): WebSocketServer | null { return this.wss; }

  private backgroundInterval: NodeJS.Timeout | null = null;

  init(server: import('http').Server) {
    logger.info('WS-UniFi', 'Initializing UniFi WebSocket server...');

    // Start background bandwidth sampling immediately so data is ready when the first client connects.
    // This runs every 3s regardless of WebSocket clients — keeps _bandwidthHistories warm.
    this.startBackgroundSampling();

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

      // Start broadcasting when first client connects (data is already warm from background sampling)
      if (this.wss && this.wss.clients.size === 1) {
        logger.debug('WS-UniFi', 'Starting bandwidth broadcasting (3s)');
        this.startPolling();
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

  /**
   * Background sampling: runs from server start so _bandwidthHistories is always warm.
   * When a WebSocket client connects, data is instantly available — no cold start.
   */
  private startBackgroundSampling() {
    // Wait a few seconds for plugins to finish initializing
    setTimeout(async () => {
      const unifiPlugin = pluginManager.getPlugin('unifi');
      if (!unifiPlugin || !unifiPlugin.isEnabled()) return;
      const pluginAny = unifiPlugin as any;
      if (typeof pluginAny.fetchWanBandwidth !== 'function') return;

      // Force a getStats() call first to populate the cached gateway device
      // (fetchWanBandwidth uses it as fallback when dashboard API returns 0)
      try {
        if (typeof pluginAny.getStats === 'function') {
          await pluginAny.getStats();
          logger.debug('WS-UniFi', 'Gateway device cache primed via getStats()');
        }
      } catch { /* ignore — getStats may fail if controller not ready */ }

      // Two rapid fetches to prime the delta-based rate computation
      try {
        await pluginAny.fetchWanBandwidth();
        await new Promise(resolve => setTimeout(resolve, 1500));
        await pluginAny.fetchWanBandwidth();
        logger.debug('WS-UniFi', 'Bandwidth history primed (2 samples)');
      } catch { /* ignore */ }

      // Continue sampling every 3s in the background
      this.backgroundInterval = setInterval(async () => {
        try {
          const plugin = pluginManager.getPlugin('unifi');
          if (plugin && plugin.isEnabled()) {
            await (plugin as any).fetchWanBandwidth();
          }
        } catch { /* ignore */ }
      }, UNIFI_POLLING_INTERVAL);
    }, 3000);
  }

  private startPolling() {
    if (this.pollingInterval) return;

    // Stop background sampling — WebSocket polling takes over to avoid interleaving
    if (this.backgroundInterval) {
      clearInterval(this.backgroundInterval);
      this.backgroundInterval = null;
    }

    this.pollingInterval = setInterval(() => {
      this.fetchAndBroadcast();
    }, UNIFI_POLLING_INTERVAL);

    // Broadcast immediately — data is already primed by background sampling
    this.fetchAndBroadcast();
  }

  private stopPolling() {
    if (this.pollingInterval) {
      logger.debug('WS-UniFi', 'Stopping bandwidth polling');
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    // Restart background sampling to keep history warm for next client
    if (!this.backgroundInterval) {
      this.backgroundInterval = setInterval(async () => {
        try {
          const plugin = pluginManager.getPlugin('unifi');
          if (plugin && plugin.isEnabled()) {
            await (plugin as any).fetchWanBandwidth();
          }
        } catch { /* ignore */ }
      }, UNIFI_POLLING_INTERVAL);
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
    if (this.backgroundInterval) {
      clearInterval(this.backgroundInterval);
      this.backgroundInterval = null;
    }
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
