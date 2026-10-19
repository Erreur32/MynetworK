import { useEffect } from 'react';
import { useUnifiRealtimeStore, type UnifiServerBandwidthPoint, type UnifiTopClient } from '../stores/unifiRealtimeStore';
import { api } from '../api/client';
import { buildWsUrl, wsReconnectDelay, WS_HIDDEN_CLOSE_MS, WS_MAX_RECONNECT_ATTEMPTS } from '../utils/wsReconnect';

interface UnifiBandwidthMessage {
  type: 'unifi_bandwidth';
  data: {
    timestamp: number;
    download: number;
    upload: number;
    wans: Record<string, { download: number; upload: number }>;
    topClients?: UnifiTopClient[];
    lan?: { download: number; upload: number };
  };
}

interface UseUnifiWebSocketOptions {
  enabled?: boolean;
}

// One socket shared by every component using the hook (ref-counted): unmounting
// one consumer never closes the socket or flips isConnected while another still uses it.
let ws: WebSocket | null = null;
let consumers = 0;
let reconnectAttempts = 0;
let connectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let hiddenCloseTimer: ReturnType<typeof setTimeout> | null = null;
// Start (epoch ms) of a period without live points (hidden tab, socket down), filled from the server afterwards
let gapSince: number | null = null;

function clearTimers() {
  for (const timer of [connectTimer, reconnectTimer, hiddenCloseTimer]) {
    if (timer) clearTimeout(timer);
  }
  connectTimer = null;
  reconnectTimer = null;
  hiddenCloseTimer = null;
}

// Fills the live chart gap from the server in-memory WAN history (same KB/s values as the WS)
function fillGap() {
  const since = gapSince;
  gapSince = null;
  // Nothing on screen yet: there is no gap to bridge
  if (since == null || document.hidden || useUnifiRealtimeStore.getState().history.length === 0) return;
  api.get<UnifiServerBandwidthPoint[]>('/api/plugins/unifi/bandwidth-history?range=0').then((res) => {
    if (res.success && Array.isArray(res.result) && res.result.length > 0) {
      useUnifiRealtimeStore.getState().fillGap(res.result, since);
    }
  }).catch(() => { /* ignore */ });
}

function connect() {
  if (connectTimer) {
    clearTimeout(connectTimer);
    connectTimer = null;
  }
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  // No consumer left, or an open, connecting or closing socket already exists (its onclose decides what comes next)
  if (consumers === 0 || ws) return;

  const wsUrl = buildWsUrl('unifi');
  if (import.meta.env.DEV) {
    console.log('[WS-UniFi] Connecting to:', wsUrl);
  }

  const socket = new WebSocket(wsUrl);
  ws = socket;

  socket.onopen = () => {
    if (ws !== socket) return;
    if (import.meta.env.DEV) console.log('[WS-UniFi] Connected');
    reconnectAttempts = 0;
    useUnifiRealtimeStore.getState().setConnected(true);
    fillGap();
  };

  socket.onmessage = (event) => {
    try {
      const message: UnifiBandwidthMessage = JSON.parse(event.data);
      if (message.type === 'unifi_bandwidth' && message.data) {
        useUnifiRealtimeStore.getState().pushPoint(message.data.download, message.data.upload, message.data.topClients, message.data.lan);
      }
    } catch (error) {
      console.error('[WS-UniFi] Parse error:', error);
    }
  };

  socket.onclose = () => {
    // Closed on purpose (last consumer gone, hidden tab) or already replaced: nothing to do
    if (ws !== socket) return;
    ws = null;
    gapSince ??= Date.now();
    useUnifiRealtimeStore.getState().setConnected(false);

    // Hidden tab: reconnected when it becomes visible again
    if (consumers === 0 || document.hidden) return;
    reconnectAttempts += 1;
    // Past the last attempt, retried on visibilitychange / online
    if (reconnectAttempts > WS_MAX_RECONNECT_ATTEMPTS) return;
    reconnectTimer = setTimeout(connect, wsReconnectDelay(reconnectAttempts));
  };

  // onclose always follows an error and schedules the retry
  socket.onerror = () => undefined;
}

function closeSocket() {
  const socket = ws;
  ws = null; // before close(), so onclose does not schedule a reconnect
  if (socket) {
    gapSince ??= Date.now();
    socket.close();
  }
  useUnifiRealtimeStore.getState().setConnected(false);
}

function startHiddenClose() {
  // pushPoint stops growing the history while hidden: remember where the gap starts
  gapSince ??= Date.now();
  hiddenCloseTimer = setTimeout(closeSocket, WS_HIDDEN_CLOSE_MS);
}

// Retry right away (fresh attempt counter) when no socket is open
function retryNow() {
  if (consumers === 0 || ws) return;
  reconnectAttempts = 0;
  connect();
}

function handleVisibilityChange() {
  if (hiddenCloseTimer) {
    clearTimeout(hiddenCloseTimer);
    hiddenCloseTimer = null;
  }
  if (document.hidden) {
    startHiddenClose();
  } else if (ws) {
    fillGap();
  } else {
    // Reopened socket fills the gap once connected
    retryNow();
  }
}

function acquire() {
  consumers += 1;
  if (consumers > 1) return;
  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('online', retryNow);
  if (document.hidden) startHiddenClose();
  // Small delay to ensure backend is ready (and to absorb StrictMode double mounts)
  connectTimer = setTimeout(connect, 500);
}

function release() {
  consumers = Math.max(0, consumers - 1);
  if (consumers > 0) return;
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  window.removeEventListener('online', retryNow);
  clearTimers();
  // gapSince is kept: the next consumer's connection fills the chart up to now
  closeSocket();
  reconnectAttempts = 0;
}

export function useUnifiWebSocket(options: UseUnifiWebSocketOptions = {}) {
  const { enabled = true } = options;
  const isConnected = useUnifiRealtimeStore((s) => s.isConnected);

  useEffect(() => {
    if (!enabled) return;
    acquire();
    return release;
  }, [enabled]);

  return { isConnected };
}
