# UniFi Real-Time Bandwidth via WebSocket

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add real-time (3s) download/upload bandwidth display for UniFi via a dedicated WebSocket (`/ws/unifi`), independent from the Freebox WebSocket. Also remove duplicate "Analyse trafic UniFi" widget from Overview events sub-tab.

**Architecture:** A new `fetchWanBandwidth()` method on UniFiPlugin makes a lightweight API call (`stat/dashboard`) every 3s to get fresh WAN byte counters. A dedicated backend WebSocket service (`/ws/unifi`) calls this method and broadcasts computed KB/s rates. A frontend Zustand store (`unifiRealtimeStore`) receives data via `useUnifiWebSocket` hook and feeds all UniFi bandwidth components.

**Tech Stack:** TypeScript, ws (WebSocket), Zustand, React, Recharts

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `server/plugins/unifi/UniFiPlugin.ts` | Add lightweight `fetchWanBandwidth()` method |
| Create | `server/services/unifiWebSocket.ts` | WebSocket server calling `fetchWanBandwidth()` every 3s |
| Modify | `server/index.ts` | Register `/ws/unifi` upgrade handler |
| Create | `src/stores/unifiRealtimeStore.ts` | Zustand store: current rates + rolling 300-point history |
| Create | `src/hooks/useUnifiWebSocket.ts` | WebSocket client hook for `/ws/unifi` |
| Modify | `src/components/widgets/PluginSummaryCard.tsx` | Use realtime store instead of HTTP polling for sparklines |
| Modify | `src/components/widgets/BandwidthHistoryWidget.tsx` | Use realtime store for UniFi "Live" mode |
| Modify | `src/pages/unifi/TrafficTab.tsx` | Use realtime store for DL/UP cards + chart |
| Modify | `src/pages/UniFiPage.tsx` | Connect WebSocket hook |
| Modify | `src/pages/UnifiedDashboardPage.tsx` | Connect WebSocket hook on dashboard |
| Modify | `src/components/layout/Header.tsx` | Display UniFi realtime speeds |
| Modify | `src/pages/unifi/OverviewTab.tsx` | Remove duplicate NetworkEventsWidget |

---

### Task 1: Backend — Add Lightweight fetchWanBandwidth() to UniFiPlugin

**Files:**
- Modify: `server/plugins/unifi/UniFiPlugin.ts`

- [ ] **Step 1: Add the fetchWanBandwidth method to UniFiPlugin class**

After the `getWanInterfaces()` method (line 258), add this new method that makes a single lightweight API call to `stat/dashboard` (or gateway device for UniFiOS) to get current WAN byte counters, then pushes to the existing bandwidth history and returns computed rates:

```typescript
    /**
     * Lightweight WAN bandwidth fetch for real-time WebSocket polling.
     * Only calls getNetworkStats() (stat/dashboard) — much lighter than full getStats().
     * Pushes new byte counters to history and returns computed KB/s rates for each WAN.
     */
    async fetchWanBandwidth(): Promise<Record<string, { download: number; upload: number }> | null> {
        if (!this.isEnabled() || !this.config) return null;

        try {
            const stats = await this.apiService.getNetworkStats();

            // Push primary WAN bytes to history
            if (stats.wan && (stats.wan.rx_bytes > 0 || stats.wan.tx_bytes > 0)) {
                this._pushToHistory('wan1', stats.wan.rx_bytes, stats.wan.tx_bytes);
            }

            // Compute rates for all WANs from history
            const result: Record<string, { download: number; upload: number }> = {};
            for (const wan of this._wanInterfaces.length > 0 ? this._wanInterfaces : [{ id: 'wan1', name: 'WAN' }]) {
                const history = this._bandwidthHistories.get(wan.id) || [];
                if (history.length >= 2) {
                    const prev = history[history.length - 2];
                    const curr = history[history.length - 1];
                    const dtSec = (curr.timestamp - prev.timestamp) / 1000;
                    if (dtSec > 0) {
                        result[wan.id] = {
                            download: Math.max(0, Math.round((curr.rx_bytes - prev.rx_bytes) / dtSec / 1024)),
                            upload: Math.max(0, Math.round((curr.tx_bytes - prev.tx_bytes) / dtSec / 1024)),
                        };
                    } else {
                        result[wan.id] = { download: 0, upload: 0 };
                    }
                } else {
                    result[wan.id] = { download: 0, upload: 0 };
                }
            }

            return result;
        } catch (error) {
            logger.debug('UniFiPlugin', 'fetchWanBandwidth failed:', error);
            return null;
        }
    }
```

- [ ] **Step 2: Commit**

```bash
git add server/plugins/unifi/UniFiPlugin.ts
git commit -m "feat: add lightweight fetchWanBandwidth() for real-time WebSocket polling"
```

---

### Task 2: Backend — UniFi WebSocket Service

**Files:**
- Create: `server/services/unifiWebSocket.ts`

- [ ] **Step 1: Create the UniFi WebSocket service**

```typescript
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
      logger.info('WS-UniFi', `Client connected from: ${clientAddress}, total: ${this.wss?.clients.size || 0}`);

      ws.isAlive = true;

      ws.on('pong', () => { ws.isAlive = true; });

      ws.on('close', () => {
        logger.info('WS-UniFi', `Client disconnected, remaining: ${this.wss?.clients.size || 0}`);
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
              logger.info('WS-UniFi', 'Starting bandwidth polling (3s)');
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
            logger.info('WS-UniFi', 'Terminating stale client');
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
```

- [ ] **Step 2: Commit**

```bash
git add server/services/unifiWebSocket.ts
git commit -m "feat: add UniFi WebSocket service for real-time bandwidth (3s)"
```

---

### Task 3: Backend — Register /ws/unifi Upgrade Handler

**Files:**
- Modify: `server/index.ts`

- [ ] **Step 1: Add import**

After line 14 (`import { logsWebSocket }...`), add:

```typescript
import { unifiWebSocket } from './services/unifiWebSocket.js';
```

- [ ] **Step 2: Initialize unifiWebSocket**

After line 374 (`logsWebSocket.init(server);`), add:

```typescript
unifiWebSocket.init(server);
```

- [ ] **Step 3: Add upgrade handler**

In the `server.on('upgrade', ...)` handler, before the `else` block (line 403 `} else {`), add:

```typescript
  } else if (url === '/ws/unifi') {
    const wss = unifiWebSocket.getWss();
    if (wss) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
```

- [ ] **Step 4: Commit**

```bash
git add server/index.ts
git commit -m "feat: register /ws/unifi WebSocket upgrade handler"
```

---

### Task 4: Frontend — UniFi Realtime Store

**Files:**
- Create: `src/stores/unifiRealtimeStore.ts`

- [ ] **Step 1: Create the Zustand store**

```typescript
import { create } from 'zustand';

interface UnifiBandwidthPoint {
  time: string;
  download: number; // KB/s
  upload: number;   // KB/s
}

interface UnifiRealtimeState {
  download: number;
  upload: number;
  history: UnifiBandwidthPoint[];
  isConnected: boolean;

  pushPoint: (download: number, upload: number) => void;
  setConnected: (connected: boolean) => void;
  reset: () => void;
}

export const useUnifiRealtimeStore = create<UnifiRealtimeState>((set) => ({
  download: 0,
  upload: 0,
  history: [],
  isConnected: false,

  pushPoint: (download: number, upload: number) => {
    const time = new Date().toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    set((state) => ({
      download,
      upload,
      history: [...state.history.slice(-299), { time, download, upload }],
    }));
  },

  setConnected: (connected: boolean) => set({ isConnected: connected }),

  reset: () => set({ download: 0, upload: 0, history: [], isConnected: false }),
}));
```

- [ ] **Step 2: Commit**

```bash
git add src/stores/unifiRealtimeStore.ts
git commit -m "feat: add UniFi realtime Zustand store"
```

---

### Task 5: Frontend — UniFi WebSocket Hook

**Files:**
- Create: `src/hooks/useUnifiWebSocket.ts`

- [ ] **Step 1: Create the hook**

Follow the same pattern as `src/hooks/useConnectionWebSocket.ts`:

```typescript
import { useEffect, useRef, useCallback, useState } from 'react';
import { useUnifiRealtimeStore } from '../stores/unifiRealtimeStore';
import { getBasePath } from '../utils/ingress';

interface UnifiBandwidthMessage {
  type: 'unifi_bandwidth';
  data: {
    timestamp: number;
    download: number;
    upload: number;
    wans: Record<string, { download: number; upload: number }>;
  };
}

interface UseUnifiWebSocketOptions {
  enabled?: boolean;
}

export function useUnifiWebSocket(options: UseUnifiWebSocketOptions = {}) {
  const { enabled = true } = options;
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef<number>(0);
  const maxReconnectAttempts = import.meta.env.PROD ? 1 : 3;
  const isPermanentlyDisabledRef = useRef<boolean>(false);
  const isConnectingRef = useRef<boolean>(false);
  const [isConnected, setIsConnected] = useState(false);

  const { pushPoint, setConnected } = useUnifiRealtimeStore();

  const connect = useCallback(() => {
    if (isPermanentlyDisabledRef.current) return;
    if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
      isPermanentlyDisabledRef.current = true;
      return;
    }
    if (isConnectingRef.current) return;

    if (wsRef.current) {
      if (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING) return;
      if (wsRef.current.readyState === WebSocket.CLOSING) return;
      try { wsRef.current.close(); } catch { /* ignore */ }
      wsRef.current = null;
    }

    isConnectingRef.current = true;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const rawBase = getBasePath();
    const basePath = rawBase.endsWith('/') ? rawBase : rawBase ? rawBase + '/' : '/';

    let wsUrl: string;
    if (import.meta.env.DEV) {
      const backendPort = import.meta.env.VITE_BACKEND_PORT || '3003';
      wsUrl = `${protocol}//${window.location.hostname}:${backendPort}${basePath}ws/unifi`;
    } else {
      wsUrl = `${protocol}//${window.location.host}${basePath}ws/unifi`;
    }

    if (import.meta.env.DEV) {
      console.log('[WS-UniFi] Connecting to:', wsUrl);
    }

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      isConnectingRef.current = false;
      if (import.meta.env.DEV) console.log('[WS-UniFi] Connected');
      setIsConnected(true);
      setConnected(true);
      reconnectAttemptsRef.current = 0;
      isPermanentlyDisabledRef.current = false;
    };

    ws.onmessage = (event) => {
      try {
        const message: UnifiBandwidthMessage = JSON.parse(event.data);
        if (message.type === 'unifi_bandwidth' && message.data) {
          pushPoint(message.data.download, message.data.upload);
        }
      } catch (error) {
        console.error('[WS-UniFi] Parse error:', error);
      }
    };

    ws.onclose = (event) => {
      isConnectingRef.current = false;
      setIsConnected(false);
      setConnected(false);
      wsRef.current = null;

      if (event.code === 1006) {
        reconnectAttemptsRef.current += 1;
        if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
          isPermanentlyDisabledRef.current = true;
          return;
        }
      } else if (event.code === 1000 || event.code === 1001) {
        reconnectAttemptsRef.current = 0;
      }

      if (enabled && reconnectAttemptsRef.current < maxReconnectAttempts && !isPermanentlyDisabledRef.current) {
        const delay = Math.min(3000 * (reconnectAttemptsRef.current + 1), 10000);
        reconnectTimeoutRef.current = setTimeout(() => connect(), delay);
      }
    };

    ws.onerror = () => {
      isConnectingRef.current = false;
      reconnectAttemptsRef.current += 1;
      if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
        isPermanentlyDisabledRef.current = true;
        if (wsRef.current) {
          try { wsRef.current.close(); } catch { /* ignore */ }
          wsRef.current = null;
        }
        if (import.meta.env.DEV) {
          console.warn('[WS-UniFi] Permanently disabled after failed attempts');
        }
      }
    };
  }, [enabled, pushPoint, setConnected]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
    setConnected(false);
    reconnectAttemptsRef.current = 0;
    isPermanentlyDisabledRef.current = false;
  }, [setConnected]);

  useEffect(() => {
    if (enabled) {
      const connectTimeout = setTimeout(() => connect(), 500);
      return () => { clearTimeout(connectTimeout); disconnect(); };
    } else {
      disconnect();
      return () => disconnect();
    }
  }, [enabled, connect, disconnect]);

  return { isConnected };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useUnifiWebSocket.ts
git commit -m "feat: add useUnifiWebSocket hook"
```

---

### Task 6: Frontend — PluginSummaryCard Uses Realtime Store

**Files:**
- Modify: `src/components/widgets/PluginSummaryCard.tsx`

- [ ] **Step 1: Add import**

```typescript
import { useUnifiRealtimeStore } from '../../stores/unifiRealtimeStore';
```

- [ ] **Step 2: Replace HTTP polling with realtime store**

Remove the `unifiHistory`/`unifiHistoryLoaded` state and the `useEffect` + `setInterval` for HTTP polling (lines 99-117). Replace with:

```typescript
    const { history: unifiHistory, isConnected: unifiWsConnected } = useUnifiRealtimeStore();
    const unifiHistoryLoaded = unifiWsConnected || unifiHistory.length > 0;
```

The existing BarChart rendering code (lines 698-744) uses `unifiHistory` with `.length > 1`, `.download`, `.upload` — these match the store's `history` shape, so no changes needed there.

- [ ] **Step 3: Commit**

```bash
git add src/components/widgets/PluginSummaryCard.tsx
git commit -m "feat: PluginSummaryCard uses UniFi realtime WebSocket store"
```

---

### Task 7: Frontend — BandwidthHistoryWidget Live Mode

**Files:**
- Modify: `src/components/widgets/BandwidthHistoryWidget.tsx`

- [ ] **Step 1: Add import**

```typescript
import { useUnifiRealtimeStore } from '../../stores/unifiRealtimeStore';
```

- [ ] **Step 2: Use realtime history for UniFi live mode**

After the existing state declarations (~line 44), add:

```typescript
    const { history: unifiRealtimeHistory } = useUnifiRealtimeStore();
```

- [ ] **Step 3: Update chartData for live mode**

Replace the `chartData` line (line 100):

```typescript
    const chartData = source === 'unifi'
        ? (selectedRange === 0 ? unifiRealtimeHistory : unifiData)
        : freeboxChartData;
```

This uses WebSocket data for live (range=0) and HTTP data for historical ranges.

- [ ] **Step 4: Commit**

```bash
git add src/components/widgets/BandwidthHistoryWidget.tsx
git commit -m "feat: BandwidthHistoryWidget uses UniFi WebSocket for live mode"
```

---

### Task 8: Frontend — TrafficTab Realtime

**Files:**
- Modify: `src/pages/unifi/TrafficTab.tsx`

- [ ] **Step 1: Add import**

```typescript
import { useUnifiRealtimeStore } from '../../stores/unifiRealtimeStore';
```

- [ ] **Step 2: Use realtime store**

Inside the component, after props destructuring (line 33), add:

```typescript
    const { history: realtimeHistory, download: realtimeDl, upload: realtimeUl, isConnected: wsConnected } = useUnifiRealtimeStore();
```

- [ ] **Step 3: Update rates display**

Replace the `dl`/`ul` computation (lines 63-65):

```typescript
    const dl = wsConnected ? realtimeDl : (bandwidthHistory[bandwidthHistory.length - 1]?.download ?? 0);
    const ul = wsConnected ? realtimeUl : (bandwidthHistory[bandwidthHistory.length - 1]?.upload ?? 0);
```

Remove the now-unused `const last = bandwidthHistory[...]` line.

- [ ] **Step 4: Update chart data source**

Add a computed variable before the JSX return:

```typescript
    const chartHistory = wsConnected && realtimeHistory.length > 1 ? realtimeHistory : bandwidthHistory;
```

Replace `data={bandwidthHistory}` with `data={chartHistory}` in the AreaChart (around line 173).

- [ ] **Step 5: Add LIVE indicator**

Near the chart title (line 108-109), after `{t('unifi.bandwidth.chartTitle')}`, add:

```typescript
{wsConnected && (
    <span className="ml-2 px-1.5 py-0.5 text-[10px] font-semibold bg-red-500/20 text-red-400 border border-red-500/30 rounded-full animate-pulse">
        LIVE
    </span>
)}
```

- [ ] **Step 6: Commit**

```bash
git add src/pages/unifi/TrafficTab.tsx
git commit -m "feat: TrafficTab uses UniFi WebSocket for real-time bandwidth"
```

---

### Task 9: Frontend — Connect WebSocket in UniFiPage and Dashboard

**Files:**
- Modify: `src/pages/UniFiPage.tsx`
- Modify: `src/pages/UnifiedDashboardPage.tsx`

- [ ] **Step 1: Connect in UniFiPage**

Add import:

```typescript
import { useUnifiWebSocket } from '../hooks/useUnifiWebSocket';
```

Inside the component, near the other hooks (~line 45), add:

```typescript
    useUnifiWebSocket({ enabled: isActive });
```

- [ ] **Step 2: Connect in UnifiedDashboardPage**

Add import:

```typescript
import { useUnifiWebSocket } from '../hooks/useUnifiWebSocket';
```

Inside the component, use the hook with the existing `hasUniFi` boolean:

```typescript
    useUnifiWebSocket({ enabled: hasUniFi });
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/UniFiPage.tsx src/pages/UnifiedDashboardPage.tsx
git commit -m "feat: connect UniFi WebSocket in UniFiPage and Dashboard"
```

---

### Task 10: Frontend — Header Realtime Speeds

**Files:**
- Modify: `src/components/layout/Header.tsx`

- [ ] **Step 1: Add import**

```typescript
import { useUnifiRealtimeStore } from '../../stores/unifiRealtimeStore';
```

- [ ] **Step 2: Use realtime data**

In the Header component, add:

```typescript
    const { download: unifiDl, upload: unifiUl, isConnected: unifiWsConnected } = useUnifiRealtimeStore();
```

Where UniFi download/upload speeds are displayed (look for `unifiStats?.network?.download`), use:
- `unifiWsConnected ? formatSpeed(unifiDl * 1024) : formatSpeed(unifiStats?.network?.download || 0)` for download
- Same pattern for upload

The `* 1024` converts KB/s (store) to bytes/s (`formatSpeed` expects bytes/s).

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/Header.tsx
git commit -m "feat: Header displays UniFi realtime bandwidth"
```

---

### Task 11: Remove Duplicate "Analyse trafic UniFi" from Overview Events Sub-tab

**Files:**
- Modify: `src/pages/unifi/OverviewTab.tsx:1243-1249`

- [ ] **Step 1: Remove the NetworkEventsWidget from events sub-tab**

Delete lines 1243-1249:

```typescript
            {/* NetworkEventsWidget for events sub-tab */}
            {overviewSubTab === 'events' && (
                <NetworkEventsWidget
                    twoColumns={true}
                    cardClassName="bg-unifi-card border border-gray-800 rounded-xl"
                    onNavigateToSearch={onNavigateToSearch}
                />
            )}
```

Also remove the unused import if `NetworkEventsWidget` is no longer used in this file:

```typescript
import { NetworkEventsWidget } from '../../components/widgets/NetworkEventsWidget';
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/unifi/OverviewTab.tsx
git commit -m "fix: remove duplicate 'Analyse trafic UniFi' from Overview events sub-tab"
```

---

### Task 12: Build Verification

**Files:** None (verification only)

- [ ] **Step 1: TypeScript check**

```bash
cd /home/tools/Project/MyNetwork && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 2: Build**

```bash
cd /home/tools/Project/MyNetwork && npm run build 2>&1 | tail -20
```

- [ ] **Step 3: Fix any errors and commit**

```bash
git add -A
git commit -m "fix: resolve build issues for UniFi WebSocket"
```

---

### Task 13: Version Bump

**Files:** Via `scripts/update-version.sh`

- [ ] **Step 1: Bump version**

```bash
cd /home/tools/Project/MyNetwork && bash scripts/update-version.sh 0.7.38
```

Commit message: `feat: Version 0.7.38 — Real-time UniFi bandwidth via dedicated WebSocket`

---

## Data Flow

```
UniFi Controller API
  ↓ fetchWanBandwidth() calls getNetworkStats() (stat/dashboard only)
  ↓ every 3s when WebSocket clients are connected
UniFiPlugin._pushToHistory() → computes KB/s rates
  ↓
unifiWebSocket broadcasts { type: 'unifi_bandwidth', data: { download, upload, wans } }
  ↓ WebSocket /ws/unifi
useUnifiWebSocket hook receives messages
  ↓
unifiRealtimeStore (current rates + 300-point rolling history)
  ↓
Components:
  - PluginSummaryCard (dashboard card BarCharts)
  - BandwidthHistoryWidget (dashboard big chart, live mode)
  - TrafficTab (UniFi page cards + chart)
  - Header (speed display)
```
