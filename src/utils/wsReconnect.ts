import { useUserAuthStore } from '../stores/userAuthStore';
import { getBasePath } from './ingress';

// Reconnection policy shared by the real-time WebSocket hooks.
// After the last attempt the hook stops retrying until the tab becomes visible
// again or the browser reports it is back online.
export const WS_MAX_RECONNECT_ATTEMPTS = 30;
const WS_BASE_RECONNECT_DELAY_MS = 1000;
const WS_MAX_RECONNECT_DELAY_MS = 60000;

// A socket is closed once the tab has been hidden this long, and reopened when it is visible again
export const WS_HIDDEN_CLOSE_MS = 2 * 60 * 1000;

/** Capped exponential backoff (1s, 2s, 4s... up to 60s) with a little jitter. attempt starts at 1. */
export function wsReconnectDelay(attempt: number): number {
  const exp = WS_BASE_RECONNECT_DELAY_MS * 2 ** Math.max(0, attempt - 1);
  const delay = Math.min(exp, WS_MAX_RECONNECT_DELAY_MS);
  return delay + Math.random() * delay * 0.2;
}

/** WebSocket URL for a backend channel (/ws/<channel>), with the JWT used for authentication. */
export function buildWsUrl(channel: 'connection' | 'unifi'): string {
  // Include base path when under Ingress so WS stays same-origin
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const rawBase = getBasePath(); // '' or '/api/hassio_ingress/xxx/'
  // Ensure the base path always ends with '/' so concatenating 'ws/<channel>' is valid
  const basePath = rawBase.endsWith('/') ? rawBase : rawBase ? rawBase + '/' : '/';

  let wsUrl: string;
  if (import.meta.env.DEV) {
    // In dev, Vite's WS server on port 5173 conflicts with HMR on the same /ws path,
    // causing "Invalid frame header". Connect directly to the backend port instead.
    // VITE_BACKEND_PORT is injected by vite.config.ts from SERVER_PORT (Docker host port)
    // or PORT (local dev port), defaulting to 3003.
    const backendPort = import.meta.env.VITE_BACKEND_PORT || '3003';
    wsUrl = `${protocol}//${window.location.hostname}:${backendPort}${basePath}ws/${channel}`;
  } else {
    // Production: same origin, reverse proxy forwards /ws/* to backend.
    wsUrl = `${protocol}//${window.location.host}${basePath}ws/${channel}`;
  }

  // Append JWT token for WebSocket authentication
  const token = useUserAuthStore.getState().getToken();
  if (token) {
    wsUrl += `${wsUrl.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;
  }
  return wsUrl;
}
