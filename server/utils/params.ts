import type { Request } from 'express';
import { createError } from '../middleware/errorHandler.js';

/**
 * Get a route param as a plain string.
 *
 * Express 5's types allow `string[]` for route params, to support new
 * path-to-regexp v6+ multi-segment wildcard patterns (e.g. `/files/*path`).
 * This project has no such routes (verified: no `*`/`+` patterns anywhere
 * in server/routes/), so every param is always a single string at runtime.
 * Falls back to the first element in the array case as a defensive measure,
 * should that assumption ever change.
 */
export function param(req: Request, key: string): string {
    const value = req.params[key];
    const result = Array.isArray(value) ? value[0] : value;
    if (result === undefined) {
        throw new Error(`Missing required route param "${key}"`);
    }
    return result;
}

/**
 * Parse a route param as an integer ID (parseInt semantics — "5abc" parses
 * as 5), throwing a 400 ApiError if it isn't a valid number. Replaces the
 * repeated `parseInt(param(req, key), 10); if (isNaN(id)) throw ...` pattern.
 */
export function requireIntParam(req: Request, key: string, errorMessage: string, errorCode: string): number {
    const id = parseInt(param(req, key), 10);
    if (isNaN(id)) {
        throw createError(errorMessage, 400, errorCode);
    }
    return id;
}

/**
 * Parse a route param as a strict integer ID (Number.isInteger semantics —
 * "5.5" is rejected, unlike parseInt), returning null instead of throwing.
 * For routes that build their own error response rather than using
 * asyncHandler + createError.
 */
export function parseStrictIntParam(req: Request, key: string): number | null {
    const id = Number(param(req, key));
    return Number.isInteger(id) ? id : null;
}
