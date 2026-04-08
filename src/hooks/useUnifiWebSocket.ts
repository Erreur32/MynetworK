import { useEffect, useRef, useCallback, useState } from 'react';
import { useUnifiRealtimeStore } from '../stores/unifiRealtimeStore';
import { useUserAuthStore } from '../stores/userAuthStore';
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
  const maxReconnectAttempts = import.meta.env.PROD ? 5 : 3;
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

    // Append JWT token for WebSocket authentication
    const token = useUserAuthStore.getState().getToken();
    if (token) {
      wsUrl += `${wsUrl.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;
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
