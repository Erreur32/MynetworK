/**
 * WebSocket rate limiter
 *
 * Tracks incoming messages per connection using a sliding window.
 * If a client exceeds the threshold, the connection is closed.
 *
 * Designed for broadcast-heavy WS (server→client). Clients normally
 * only send pong frames, so any burst of real messages is suspicious.
 */

import type { WebSocket as WsType } from 'ws';
import { logger } from '../utils/logger.js';

interface RateLimitState {
    timestamps: number[];
}

const DEFAULT_MAX_MESSAGES = 50;   // max messages per window
const DEFAULT_WINDOW_MS = 10_000;  // 10-second window

const states = new WeakMap<WsType, RateLimitState>();

/**
 * Apply rate limiting to a WebSocket connection.
 * Call this once per new connection, inside the 'connection' handler.
 *
 * @param ws - The WebSocket client
 * @param label - Service label for logging (e.g. 'WS', 'LogsWS')
 * @param maxMessages - Max allowed messages in the window (default 50)
 * @param windowMs - Sliding window duration in ms (default 10 000)
 */
export function applyWsRateLimit(
    ws: WsType,
    label: string,
    maxMessages: number = DEFAULT_MAX_MESSAGES,
    windowMs: number = DEFAULT_WINDOW_MS
): void {
    const state: RateLimitState = { timestamps: [] };
    states.set(ws, state);

    ws.on('message', () => {
        const now = Date.now();
        const cutoff = now - windowMs;

        // Prune timestamps outside the window
        state.timestamps = state.timestamps.filter(t => t > cutoff);
        state.timestamps.push(now);

        if (state.timestamps.length > maxMessages) {
            logger.warn(label, `Rate limit exceeded (${state.timestamps.length}/${maxMessages} msgs in ${windowMs / 1000}s), closing connection`);
            ws.close(4429, 'Rate limit exceeded');
        }
    });
}
