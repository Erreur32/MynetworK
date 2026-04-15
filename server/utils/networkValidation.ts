/**
 * Shared network input validation utilities
 *
 * Single source of truth for IP, MAC, and hostname validation.
 * Used by networkScanService, portScanService, speedtest, etc.
 */

const IPV4_REGEX = /^\d{1,3}(?:\.\d{1,3}){3}$/;
const MAC_REGEX = /([0-9a-f]{2}[:-]){5}([0-9a-f]{2})/i;
const MAC_STRICT_REGEX = /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/;
const HOSTNAME_CHARS_REGEX = /^[a-zA-Z0-9.-]+$/;

/**
 * Validate an IPv4 address string
 */
export function isValidIp(ip: string): boolean {
    if (!IPV4_REGEX.test(ip)) return false;
    const parts = ip.split('.').map(Number);
    return parts.length === 4 && parts.every(p => p >= 0 && p <= 255);
}

/**
 * Validate an IP or safe hostname (for ping targets)
 */
export function isValidPingTarget(target: string): boolean {
    if (isValidIp(target)) return true;
    return /^[a-zA-Z0-9][a-zA-Z0-9.\-]{0,253}[a-zA-Z0-9]$/.test(target);
}

/**
 * Extract the first MAC address from a string (e.g. command output)
 */
export function extractMac(text: string): string | null {
    const match = text.match(MAC_REGEX);
    if (!match) return null;
    const mac = match[0].toLowerCase().replace(/-/g, ':');
    if (mac === '00:00:00:00:00:00' || mac.length !== 17) return null;
    return mac;
}

/**
 * Validate a strict MAC format (xx:xx:xx:xx:xx:xx)
 */
export function isValidMac(mac: string): boolean {
    return MAC_STRICT_REGEX.test(mac.toLowerCase());
}

/**
 * Normalize MAC for comparison (lowercase, no separators)
 */
export function normalizeMac(mac: string): string {
    return mac.toLowerCase().replace(/[:-]/g, '');
}

/**
 * Validate a hostname candidate (not an IP, valid chars, reasonable length)
 */
export function isValidHostname(hostname: string, ip?: string): boolean {
    if (!hostname || hostname.length === 0 || hostname.length >= 64) return false;
    if (!HOSTNAME_CHARS_REGEX.test(hostname)) return false;
    if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) return false;
    if (ip && hostname === ip) return false;
    return true;
}

/**
 * Validate a port range string (e.g. "80", "1-1000", "22,80,443")
 * Checks format AND numeric bounds (1-65535)
 */
export function isValidPortRange(range: string): boolean {
    if (!/^\d{1,5}(?:-\d{1,5})?(?:,\d{1,5}(?:-\d{1,5})?)*$/.test(range)) return false;
    const ports = range.replace(/-/g, ',').split(',').map(Number);
    return ports.every(p => p >= 1 && p <= 65535);
}
