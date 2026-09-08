import type { Request } from 'express';

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
    return Array.isArray(value) ? value[0] : value;
}
