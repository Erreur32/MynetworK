/**
 * Home Assistant Ingress support: base path detection for API and WebSocket URLs.
 * When the app is served under a path prefix (e.g. /api_ingress/<token>/), all
 * requests must use that prefix so they stay same-origin.
 */

let cachedBasePath: string | null = null;

/**
 * Returns the base path when the app is running under Home Assistant Ingress
 * (or any path prefix like /api_ingress/xxx/). Otherwise returns ''.
 * Result is cached for the session so it does not change.
 */
export function getBasePath(): string {
  if (typeof window === 'undefined') return '';
  if (cachedBasePath !== null) return cachedBasePath;
  const pathname = window.location.pathname;
  const match = pathname.match(/^(\/api_ingress\/[^/]+\/)/);
  cachedBasePath = match ? match[1] : '';
  return cachedBasePath;
}
