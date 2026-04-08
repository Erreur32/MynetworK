/**
 * Rate limiting middleware
 *
 * Provides reusable rate limiters for different route categories.
 * Uses express-rate-limit with in-memory store (suitable for single-instance deployment).
 */

import rateLimit from 'express-rate-limit';

/** General API rate limiter — 100 requests per minute per IP */
export const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests, please try again later' } }
});

/** Stricter limiter for write/destructive operations — 30 requests per minute per IP */
export const writeLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests, please try again later' } }
});

/** Network scan limiter — 10 scans per minute per IP (scans are resource-heavy) */
export const scanLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many scan requests, please try again later' } }
});
