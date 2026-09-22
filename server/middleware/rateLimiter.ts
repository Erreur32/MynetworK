/**
 * Rate limiting middleware
 *
 * Provides reusable rate limiters for different route categories.
 * Uses express-rate-limit with in-memory store (suitable for single-instance deployment).
 */

import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import type { Request } from 'express';

/**
 * Key generator based on the actual TCP peer address, not req.ip. req.ip is
 * derived from X-Forwarded-For via the app's `trust proxy: 1` setting, which
 * is just as spoofable as CF-Connecting-IP/X-Real-IP on the directly-published
 * Docker port (same reasoning as mcpAuthMiddleware's LAN-only gate) — using it
 * here would defeat the point of dropping those other headers. Wrapped through
 * ipKeyGenerator() so IPv6 addresses are normalised to a /64 prefix — without
 * it, every IPv6 address would have its own bucket, allowing IPv6 users to
 * easily bypass the limit (ERR_ERL_KEY_GEN_IPV6).
 */
const keyGenerator = (req: Request): string => {
    return ipKeyGenerator(req.socket.remoteAddress || 'unknown');
};

/** General API rate limiter — 300 requests per minute per IP */
export const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    keyGenerator,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests, please try again later' } }
});

/** Stricter limiter for write/destructive operations — 30 requests per minute per IP */
export const writeLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    keyGenerator,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests, please try again later' } }
});

/** Network scan limiter — 60 requests per minute per IP (read endpoints + polling) */
export const scanLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    keyGenerator,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many scan requests, please try again later' } }
});
