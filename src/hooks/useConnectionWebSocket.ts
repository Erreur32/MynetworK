import { useEffect, useRef, useCallback, useState } from 'react';
import { useConnectionStore } from '../stores/connectionStore';
import { useSystemStore } from '../stores/systemStore';
import type { ConnectionStatus } from '../types/api';
import { buildWsUrl, wsReconnectDelay, WS_HIDDEN_CLOSE_MS, WS_MAX_RECONNECT_ATTEMPTS } from '../utils/wsReconnect';

interface SystemStatusData {
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

// Freebox native event data types
interface LanHostEventData {
  id: string;
  name: string;
  host_type?: string;
  vendor_name?: string;
  active: boolean;
  timestamp: number;
}

interface VmEventData {
  id: number;
  status?: string;
  done?: boolean;
  error?: boolean;
  timestamp: number;
}

interface FreeboxEventMessage {
  type: 'freebox_event';
  eventType: string;
  data: LanHostEventData | VmEventData;
}

interface WebSocketMessage {
  type: 'connection_status' | 'system_status' | 'freebox_event';
  eventType?: string;
  data: ConnectionStatus | SystemStatusData | LanHostEventData | VmEventData;
}

interface UseConnectionWebSocketOptions {
  enabled?: boolean;
  onFreeboxEvent?: (eventType: string, data: LanHostEventData | VmEventData) => void;
}

type TimerRef = { current: ReturnType<typeof setTimeout> | null };

function clearTimer(ref: TimerRef) {
  if (ref.current) {
    clearTimeout(ref.current);
    ref.current = null;
  }
}

/**
 * Hook to manage WebSocket connection for real-time connection status updates
 * Replaces polling for /api/connection
 * Also receives native Freebox WebSocket events (lan_host, vm_state, etc.)
 * Reconnects with a capped exponential backoff, closes the socket after the tab
 * has been hidden for a while and reopens it when the tab is visible again.
 */
export function useConnectionWebSocket(options: UseConnectionWebSocketOptions = {}) {
  const { enabled = true, onFreeboxEvent } = options;
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fallbackFetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hiddenCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef<number>(0);
  // Set by the first connection_status message. A ref, not the isConnected state,
  // so the open handler's fallback check never reads a stale value.
  const receivedStatusRef = useRef<boolean>(false);
  const enabledRef = useRef(enabled);
  const onFreeboxEventRef = useRef(onFreeboxEvent);
  const [isConnected, setIsConnected] = useState(false);

  const { fetchConnectionStatus } = useConnectionStore();

  useEffect(() => {
    enabledRef.current = enabled;
    onFreeboxEventRef.current = onFreeboxEvent;
  }, [enabled, onFreeboxEvent]);

  const connect = useCallback(() => {
    if (!enabledRef.current) return;
    // An open, connecting or closing socket already exists: its onclose decides what comes next
    if (wsRef.current) return;
    clearTimer(reconnectTimeoutRef);

    const wsUrl = buildWsUrl('connection');
    if (import.meta.env.DEV) {
      console.log('[WS Client] Connecting to:', wsUrl);
    }
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    receivedStatusRef.current = false;

    ws.onopen = () => {
      if (wsRef.current !== ws) return;
      if (import.meta.env.DEV) {
        console.log('[WS Client] Connected successfully');
      }
      setIsConnected(true);
      reconnectAttemptsRef.current = 0; // Reset counter on successful connection
      // Don't fetch immediately - wait for WebSocket to send data
      // The server will send connection_status and system_status via WebSocket
      // Only fetch if WebSocket doesn't send data within a reasonable time
      clearTimer(fallbackFetchTimeoutRef);
      fallbackFetchTimeoutRef.current = setTimeout(() => {
        fallbackFetchTimeoutRef.current = null;
        // If still connected but no data received, do a fallback fetch
        if (wsRef.current === ws && ws.readyState === WebSocket.OPEN && !receivedStatusRef.current) {
          fetchConnectionStatus();
        }
      }, 2000); // Wait 2 seconds for WebSocket data
    };

    ws.onmessage = (event) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data);

        if (message.type === 'connection_status' && message.data) {
          const status = message.data as ConnectionStatus;
          receivedStatusRef.current = true;

          // When tab is hidden, update status only — don't grow the history array.
          // Prevents a render storm in chart components when the tab becomes visible again.
          const hidden = typeof document !== 'undefined' && document.hidden;

          useConnectionStore.setState((state) => {
            if (hidden) {
              return { status, error: null };
            }
            const newPoint = {
              time: new Date().toLocaleTimeString('fr-FR', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
              }),
              download: Math.round(status.rate_down / 1024),
              upload: Math.round(status.rate_up / 1024)
            };

            return {
              status,
              error: null,
              history: [...state.history.slice(-299), newPoint] // Keep last 300 points (5 minutes)
            };
          });
        } else if (message.type === 'system_status' && message.data) {
          const systemData = message.data as SystemStatusData;

          const hidden = typeof document !== 'undefined' && document.hidden;

          // Update system store with real-time data
          useSystemStore.setState((state) => {
            // Calculate CPU temp: average of Ultra cores or use legacy cpum
            let cpuM: number | undefined;
            if (systemData.temp_cpu0 != null) {
              // Ultra: average of 4 CPU cores
              const temps = [
                systemData.temp_cpu0,
                systemData.temp_cpu1,
                systemData.temp_cpu2,
                systemData.temp_cpu3
              ].filter((t): t is number => t != null);
              cpuM = temps.length > 0 ? Math.round(temps.reduce((a, b) => a + b, 0) / temps.length) : undefined;
            } else {
              cpuM = systemData.temp_cpum;
            }

            const newPoint = {
              time: new Date().toLocaleTimeString('fr-FR', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
              }),
              cpuM,
              cpuB: systemData.temp_cpub,
              sw: systemData.temp_sw
            };

            // Update info with latest values
            const updatedInfo = state.info ? {
              ...state.info,
              temp_cpu0: systemData.temp_cpu0,
              temp_cpu1: systemData.temp_cpu1,
              temp_cpu2: systemData.temp_cpu2,
              temp_cpu3: systemData.temp_cpu3,
              temp_cpum: systemData.temp_cpum ?? cpuM,
              temp_cpub: systemData.temp_cpub,
              temp_sw: systemData.temp_sw,
              fan_rpm: systemData.fan_rpm,
              uptime_val: systemData.uptime_val ?? state.info.uptime_val
            } : null;

            if (hidden) {
              return { info: updatedInfo };
            }
            return {
              info: updatedInfo,
              temperatureHistory: [...state.temperatureHistory.slice(-299), newPoint] // Keep last 300 points (5 minutes)
            };
          });
        } else if (message.type === 'freebox_event' && message.eventType && message.data) {
          // Native Freebox WebSocket event (lan_host, vm_state, etc.)
          // console.log('[WS Client] Freebox event:', message.eventType, message.data); // Debug only
          if (onFreeboxEventRef.current) {
            onFreeboxEventRef.current(message.eventType, message.data as LanHostEventData | VmEventData);
          }
        }
      } catch (error) {
        console.error('[WS Client] Failed to parse message:', error);
      }
    };

    ws.onclose = (event) => {
      // Closed on purpose (disconnect, hidden tab) or already replaced: nothing to do
      if (wsRef.current !== ws) return;
      wsRef.current = null;
      clearTimer(fallbackFetchTimeoutRef);
      setIsConnected(false);

      // Code 1006 (abnormal closure) is expected on backend restarts and proxy issues: not logged
      if (import.meta.env.DEV && event.code !== 1000 && event.code !== 1001 && event.code !== 1006) {
        console.warn('[WS Client] Disconnected:', event.code, event.reason);
      }

      // Hidden tab: the visibility handler reconnects when it is visible again
      if (!enabledRef.current || document.hidden) return;
      reconnectAttemptsRef.current += 1;
      // Past the last attempt, retried on visibilitychange / online. HTTP polling fallback covers the gap.
      if (reconnectAttemptsRef.current > WS_MAX_RECONNECT_ATTEMPTS) return;
      reconnectTimeoutRef.current = setTimeout(connect, wsReconnectDelay(reconnectAttemptsRef.current));
    };

    // onclose always follows an error and schedules the retry
    ws.onerror = () => undefined;
  }, [fetchConnectionStatus]);

  const disconnect = useCallback(() => {
    clearTimer(reconnectTimeoutRef);
    clearTimer(fallbackFetchTimeoutRef);

    const ws = wsRef.current;
    wsRef.current = null; // before close(), so onclose does not schedule a reconnect
    if (ws) {
      ws.close();
    }

    setIsConnected(false);
    reconnectAttemptsRef.current = 0; // Reset counter on manual disconnect
  }, []);

  useEffect(() => {
    if (!enabled) {
      disconnect();
      return;
    }

    // Add a small delay to ensure backend is ready (especially after npm run dev restart)
    const connectTimeout = setTimeout(connect, 500);

    // Retry right away (fresh attempt counter) when no socket is open
    const retryNow = () => {
      if (wsRef.current) return;
      reconnectAttemptsRef.current = 0;
      connect();
    };
    const startHiddenClose = () => {
      clearTimer(hiddenCloseTimeoutRef);
      hiddenCloseTimeoutRef.current = setTimeout(disconnect, WS_HIDDEN_CLOSE_MS);
    };
    const handleVisibilityChange = () => {
      if (document.hidden) {
        startHiddenClose();
      } else {
        clearTimer(hiddenCloseTimeoutRef);
        retryNow();
      }
    };
    if (document.hidden) startHiddenClose();

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', retryNow);

    return () => {
      clearTimeout(connectTimeout);
      clearTimer(hiddenCloseTimeoutRef);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', retryNow);
      disconnect();
    };
  }, [enabled, connect, disconnect]);

  return { isConnected };
}


// Export types for use in components
export type { LanHostEventData, VmEventData };
