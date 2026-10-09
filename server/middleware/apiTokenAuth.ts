/**
 * Read-only REST API tokens (kind "api" in mcp_tokens, "mwk_api_" prefix).
 *
 * Lets an external service on the LAN (e.g. MyServices) read the network
 * inventory without a user login. Called by requireAuth for any bearer token
 * carrying the API prefix. Order: client network -> token -> method -> route.
 * The route allowlist below is the single source of truth, mirrored in
 * docs/API-TOKENS.md.
 */
import { Response, NextFunction } from 'express';
import { mcpAuthService, API_TOKEN_PREFIX } from '../services/mcpAuthService.js';
import { isTrustedNetworkClient } from './mcpAuthMiddleware.js';
import type { AuthenticatedRequest } from './authMiddleware.js';

export interface ApiTokenRoute {
    path: string;
    pattern: RegExp;
}

const IPV4 = String.raw`\d{1,3}(?:\.\d{1,3}){3}`;

/** GET/HEAD routes reachable with an API token. Everything else returns 403. */
export const API_TOKEN_ALLOWED_ROUTES: readonly ApiTokenRoute[] = [
    { path: '/api/network-scan/history', pattern: /^\/api\/network-scan\/history$/ },
    { path: '/api/network-scan/:ip', pattern: new RegExp(`^/api/network-scan/${IPV4}$`) },
    { path: '/api/lan/devices', pattern: /^\/api\/lan\/devices$/ },
    { path: '/api/dhcp/leases', pattern: /^\/api\/dhcp\/leases$/ },
    { path: '/api/wifi/stations', pattern: /^\/api\/wifi\/stations$/ },
    { path: '/api/topology', pattern: /^\/api\/topology$/ },
    { path: '/api/plugins/unifi/clients', pattern: /^\/api\/plugins\/unifi\/clients$/ },
    { path: '/api/plugins/unifi/devices', pattern: /^\/api\/plugins\/unifi\/devices$/ }
];

const READ_METHODS = new Set(['GET', 'HEAD']);

// Any field whose name looks like a credential is dropped from API token
// responses, at any depth, even on allowlisted routes: relayed device
// payloads (Freebox, UniFi) are not under our control and may grow new
// sensitive fields. Deliberately broad: losing a harmless field such as
// "authorized" is preferable to leaking a key.
const SENSITIVE_FIELD = /key|pass|secret|token|auth|psk|cookie/i;

export function stripSensitiveFields(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(stripSensitiveFields);
    if (value === null || typeof value !== 'object') return value;

    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
        if (!SENSITIVE_FIELD.test(k)) out[k] = stripSensitiveFields(v);
    }
    return out;
}

export function isApiTokenRouteAllowed(path: string): boolean {
    let normalized = path;
    while (normalized.length > 1 && normalized.endsWith('/')) normalized = normalized.slice(0, -1);
    return API_TOKEN_ALLOWED_ROUTES.some((route) => route.pattern.test(normalized));
}

function deny(res: Response, status: number, code: string, message: string): void {
    res.status(status).json({ success: false, error: { code, message } });
}

export function authenticateApiToken(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
    token: string
): void {
    if (!isTrustedNetworkClient(req)) {
        deny(res, 403, 'API_TOKEN_NETWORK', 'API tokens are restricted to the local network and Tailscale');
        return;
    }

    const row = mcpAuthService.verifyToken(token, 'api');
    if (!row) {
        deny(res, 401, 'API_TOKEN_INVALID', 'Invalid, expired or revoked API token');
        return;
    }

    if (!READ_METHODS.has(req.method)) {
        deny(res, 403, 'API_TOKEN_READ_ONLY', 'API tokens are read-only (GET/HEAD only)');
        return;
    }

    const path = req.originalUrl.split('?')[0];
    if (!isApiTokenRouteAllowed(path)) {
        deny(res, 403, 'API_TOKEN_ROUTE_NOT_ALLOWED', `Route not available to API tokens: ${path}`);
        return;
    }

    mcpAuthService.recordUsage(row.id);
    req.apiToken = { id: row.id, name: row.name };
    // userId 0 is never a real user: logs store it as NULL (no FK violation)
    // and the "api:" prefix identifies the token in audit logs.
    req.user = { userId: 0, username: `api:${row.name}`, role: 'viewer' };

    const json = res.json.bind(res);
    res.json = (body: unknown) => json(stripSensitiveFields(body));

    next();
}

export function isApiToken(token: string): boolean {
    return token.startsWith(API_TOKEN_PREFIX);
}
