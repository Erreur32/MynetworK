import { WebSocketServer, WebSocket } from 'ws';
import type { WebSocket as WsType } from 'ws';
import { pluginManager } from './pluginManager.js';
import { logger } from '../utils/logger.js';
import { applyWsRateLimit } from './wsRateLimiter.js';

type ClientWebSocket = WsType & { isAlive?: boolean };

const UNIFI_LIVE_INTERVAL = 2000; // 2s, while at least one WebSocket client is connected
const UNIFI_BACKGROUND_INTERVAL = 30_000; // 30s with no client, only keeps the bandwidth history warm
const TOP_CLIENTS_EVERY_N_TICKS = 2; // stat/sta is extra load on top of the WAN poll, throttle to ~4s
// Enough for the full traffic overlay; compact views (widgets, UniFi traffic tab) slice to 10 themselves
const TOP_CLIENTS_LIMIT = 50;

class UnifiWebSocketService {
  private wss: WebSocketServer | null = null;
  private pollingInterval: NodeJS.Timeout | null = null;
  private pingInterval: NodeJS.Timeout | null = null;
  private topClientsTick = 0;
  private lastTopClients: unknown[] = [];
  private lastTotalClientTraffic: { download: number; upload: number } = { download: 0, upload: 0 };
  // Overlap guard shared by the live and background loops: a tick is skipped while the
  // previous sample is still in flight (slow controller), instead of stacking requests.
  private sampling = false;

  getWss(): WebSocketServer | null { return this.wss; }

  private backgroundInterval: NodeJS.Timeout | null = null;

  init(server: import('http').Server) {
    logger.info('WS-UniFi', 'Initializing UniFi WebSocket server...');

    // Start background bandwidth sampling immediately so data is ready when the first client connects.
    // This runs every 30s while no WebSocket client is connected, keeps _bandwidthHistories warm.
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
      applyWsRateLimit(ws, 'WS-UniFi');

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

      // Start broadcasting when first client connects (history is already warm from background sampling)
      if (this.wss && this.wss.clients.size === 1) {
        logger.debug('WS-UniFi', `Starting bandwidth broadcasting (${UNIFI_LIVE_INTERVAL / 1000}s)`);
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
   * When a WebSocket client connects, data is instantly available, no cold start.
   */
  private startBackgroundSampling() {
    // Wait a few seconds for plugins to finish initializing
    setTimeout(async () => {
      const unifiPlugin = pluginManager.getPlugin('unifi');
      const pluginAny = unifiPlugin as any;
      if (unifiPlugin && unifiPlugin.isEnabled() && typeof pluginAny.fetchWanBandwidth === 'function') {
        this.sampling = true;
        try {
          // Force a getStats() call first to learn the gateway MAC, which lets
          // fetchWanBandwidth request the gateway alone
          try {
            if (typeof pluginAny.getStats === 'function') {
              await pluginAny.getStats();
              logger.debug('WS-UniFi', 'Gateway device cache primed via getStats()');
            }
          } catch { /* ignore, getStats may fail if controller not ready */ }

          // Two rapid fetches to prime the delta-based rate computation. The pause is longer
          // than the API service's 1.5s response cache, so the second sample is a fresh one.
          try {
            await pluginAny.fetchWanBandwidth();
            await new Promise(resolve => setTimeout(resolve, 2000));
            await pluginAny.fetchWanBandwidth();
            logger.debug('WS-UniFi', 'Bandwidth history primed (2 samples)');
          } catch { /* ignore */ }
        } finally {
          this.sampling = false;
        }
      }

      // Continue sampling in the background, unless a client connected meanwhile (live polling runs)
      if (!this.pollingInterval) this.startBackgroundInterval();
    }, 3000);
  }

  /**
   * Background loop (no WebSocket client): one WAN sample every 30s, enough to keep the
   * bandwidth history covering 7 days without polling the controller every second.
   */
  private startBackgroundInterval() {
    if (this.backgroundInterval) return;
    this.backgroundInterval = setInterval(async () => {
      if (this.sampling) return;
      this.sampling = true;
      try {
        const plugin = pluginManager.getPlugin('unifi');
        if (plugin && plugin.isEnabled()) {
          await (plugin as any).fetchWanBandwidth();
        }
      } catch { /* ignore */ } finally {
        this.sampling = false;
      }
    }, UNIFI_BACKGROUND_INTERVAL);
  }

  private startPolling() {
    if (this.pollingInterval) return;

    // Stop background sampling, WebSocket polling takes over to avoid interleaving
    if (this.backgroundInterval) {
      clearInterval(this.backgroundInterval);
      this.backgroundInterval = null;
    }

    this.pollingInterval = setInterval(() => {
      this.fetchAndBroadcast();
    }, UNIFI_LIVE_INTERVAL);

    // Sample and broadcast immediately: the last background point is at most 30s old, so the
    // first rate is available right away; the next tick (2s) gives the live rate.
    this.fetchAndBroadcast();
  }

  private stopPolling() {
    if (this.pollingInterval) {
      logger.debug('WS-UniFi', 'Stopping bandwidth polling');
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    // Restart background sampling to keep history warm for next client
    this.startBackgroundInterval();
  }

  private async fetchAndBroadcast() {
    if (!this.wss || this.wss.clients.size === 0) return;

    const unifiPlugin = pluginManager.getPlugin('unifi');
    if (!unifiPlugin || !unifiPlugin.isEnabled()) return;

    // Previous tick still waiting for the controller: skip this one
    if (this.sampling) return;
    this.sampling = true;

    try {
      const pluginAny = unifiPlugin as any;
      if (typeof pluginAny.fetchWanBandwidth !== 'function') return;

      const wanData = await pluginAny.fetchWanBandwidth();
      if (!wanData) return;

      const primaryWan = wanData['wan1'] || { download: 0, upload: 0 };

      // getClients() is extra load on top of the WAN poll already happening every tick,
      // only refresh it every TOP_CLIENTS_EVERY_N_TICKS, reuse the last value in between.
      // Top clients and the total come from the same stat/sta response.
      this.topClientsTick = (this.topClientsTick + 1) % TOP_CLIENTS_EVERY_N_TICKS;
      if (this.topClientsTick === 0 && typeof pluginAny.fetchClientTraffic === 'function') {
        const traffic = await pluginAny.fetchClientTraffic(TOP_CLIENTS_LIMIT).catch(() => null);
        if (traffic) {
          this.lastTopClients = traffic.topClients;
          this.lastTotalClientTraffic = traffic.total;
        }
      }
      const topClients = this.lastTopClients;
      const totalClientTraffic = this.lastTotalClientTraffic;

      // LAN ≈ total client traffic − WAN. An approximation (independently-sampled sources,
      // no single "LAN interface" counter exists on UniFi), clamped to 0 since sampling
      // jitter between the two sources can otherwise produce a small negative value.
      const lan = {
        download: Math.max(0, totalClientTraffic.download - primaryWan.download),
        upload: Math.max(0, totalClientTraffic.upload - primaryWan.upload),
      };

      const message = JSON.stringify({
        type: 'unifi_bandwidth',
        data: {
          timestamp: Date.now(),
          download: primaryWan.download, // KB/s
          upload: primaryWan.upload,     // KB/s
          wans: wanData,
          topClients,
          totalClientTraffic,
          lan,
        }
      });

      this.wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          try { client.send(message); } catch { /* ignore */ }
        }
      });
    } catch (error) {
      logger.debug('WS-UniFi', 'fetchAndBroadcast error:', error);
    } finally {
      this.sampling = false;
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
