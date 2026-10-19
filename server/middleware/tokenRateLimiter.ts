/**
 * Per-token rate limiting for REST API tokens and MCP tokens.
 *
 * The express-rate-limit limiters in rateLimiter.ts are keyed on the client
 * IP and run before authentication; these ones are keyed on the token id
 * (api and mcp tokens share the mcp_tokens id space), so one token cannot
 * exhaust the budget of a whole host, and expensive calls (live ping, plugin
 * fan-out, scans) get a tighter bucket. Session (JWT) users of the UI are
 * never counted here.
 */

export interface RateLimitDecision {
    allowed: boolean;
    retryAfterSeconds: number;
}

/** Fixed-window counter per key, in memory (single-instance deployment). */
export class FixedWindowLimiter {
    private readonly windows = new Map<string, { start: number; count: number }>();

    constructor(
        readonly max: number,
        readonly windowMs: number
    ) {}

    hit(key: string, now: number = Date.now()): RateLimitDecision {
        let entry = this.windows.get(key);
        if (!entry || now - entry.start >= this.windowMs) {
            this.prune(now);
            entry = { start: now, count: 0 };
            this.windows.set(key, entry);
        }
        if (entry.count >= this.max) {
            return { allowed: false, retryAfterSeconds: Math.ceil((entry.start + this.windowMs - now) / 1000) };
        }
        entry.count++;
        return { allowed: true, retryAfterSeconds: 0 };
    }

    reset(): void {
        this.windows.clear();
    }

    // Expired windows are dropped lazily, only when the map grows (few tokens in practice)
    private prune(now: number): void {
        if (this.windows.size < 100) return;
        for (const [key, entry] of this.windows) {
            if (now - entry.start >= this.windowMs) this.windows.delete(key);
        }
    }
}

/** Every request made with a token: 300 per minute per token */
export const tokenGeneralLimiter = new FixedWindowLimiter(300, 60 * 1000);

/** Expensive calls (ip-details, live UniFi top traffic, MCP machine details/rescan/scan): 30 per minute per token */
export const tokenHeavyLimiter = new FixedWindowLimiter(30, 60 * 1000);

/**
 * Counts one request for a token, plus one heavy call when `heavy` is set.
 * Returns the first refusal, or an allowed decision.
 */
export function checkTokenRateLimit(tokenId: number, heavy: boolean): RateLimitDecision {
    const key = String(tokenId);
    const general = tokenGeneralLimiter.hit(key);
    if (!general.allowed || !heavy) return general;
    return tokenHeavyLimiter.hit(key);
}

/** Heavy bucket only (MCP tool calls: the HTTP request was already counted by the general bucket) */
export function checkTokenHeavyLimit(tokenId: number): RateLimitDecision {
    return tokenHeavyLimiter.hit(String(tokenId));
}
