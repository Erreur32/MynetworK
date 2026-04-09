/**
 * Rate limiting middleware
 *
 * Provides reusable rate limiters for different route categories.
 * Uses express-rate-limit with in-memory store (suitable for single-instance deployment).
 */

import rateLimit from 'express-rate-limit';
import type { Request } from 'express';

/**
 * Key generator that uses CF-Connecting-IP (Cloudflare) or X-Real-IP
 * before falling back to req.ip. This prevents all users behind a
 * reverse proxy from sharing the same rate limit bucket.
 */
const keyGenerator = (req: Request): string => {
    return (req.headers['cf-connecting-ip'] as string)
        || (req.headers['x-real-ip'] as string)
        || req.ip
        || 'unknown';
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
