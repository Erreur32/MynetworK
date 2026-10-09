/**
 * Credential masking for non-admin users.
 *
 * Several read routes relay device configs that embed credentials (Freebox
 * WiFi/guest keys, DynDNS and FTP passwords, UniFi controller password and
 * API key). Viewers and regular users need the rest of those payloads to
 * render their pages, but must never see the secrets themselves.
 */
import type { Request } from 'express';
import type { AuthenticatedRequest } from '../middleware/authMiddleware.js';

const SECRET_KEYS = new Set(['key', 'password', 'apiKey']);

// Non-empty secrets are replaced (not removed) so the frontend's
// "is a key/password configured?" truthiness checks keep working.
const MASK = '********';

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value === null || typeof value !== 'object') return value;

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = SECRET_KEYS.has(k) && typeof v === 'string' && v !== '' ? MASK : redact(v);
  }
  return out;
}

/** Returns `value` untouched for admins, a deep copy with credentials masked otherwise. */
export function redactForNonAdmin<T>(req: Request, value: T): T {
  return (req as AuthenticatedRequest).user?.role === 'admin' ? value : (redact(value) as T);
}
