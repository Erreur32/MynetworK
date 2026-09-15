/**
 * Validation for the manual vendor-icon override stored on a network_scans row.
 *
 * Supported formats:
 *   - `simple:<slug>`  — a bundled simple-icons brand (picked from the catalog)
 *   - `local:<slug>`   — a bundled local brand logo, not from simple-icons (picked from the catalog)
 *   - `lucide:<Name>`  — a bundled lucide-react fallback icon (picked from the catalog)
 *   - `custom:data:image/(png|jpeg|webp|svg+xml);base64,<...>` — user-imported icon
 *
 * Custom SVG uploads only get a defense-in-depth reject-list here (no full
 * sanitization yet); they are rendered exclusively via `<img src>`, where
 * browsers never execute embedded scripts, so this is a secondary safeguard,
 * not the boundary the security model relies on.
 */

const MAX_CUSTOM_ICON_LENGTH = 200_000; // ~150KB decoded, enough for a small logo
const CUSTOM_DATA_URL_REGEX = /^data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/]+=*$/;
const SVG_REJECT_PATTERNS = [/<script/i, /\son[a-z]+\s*=/i, /javascript:/i, /<foreignobject/i];

export function isValidVendorIconId(value: unknown): value is string {
    if (typeof value !== 'string' || value.length === 0) return false;

    if (value.startsWith('simple:') || value.startsWith('local:') || value.startsWith('lucide:')) {
        return /^[a-z0-9-]{1,50}$/i.test(value.split(':', 2)[1] || '');
    }

    if (value.startsWith('custom:')) {
        const dataUrl = value.slice('custom:'.length);
        if (dataUrl.length > MAX_CUSTOM_ICON_LENGTH) return false;
        const match = CUSTOM_DATA_URL_REGEX.exec(dataUrl);
        if (!match) return false;
        if (match[1] === 'svg+xml') {
            const base64 = dataUrl.slice(dataUrl.indexOf('base64,') + 'base64,'.length);
            let decoded: string;
            try {
                decoded = Buffer.from(base64, 'base64').toString('utf8');
            } catch {
                return false;
            }
            if (SVG_REJECT_PATTERNS.some((p) => p.test(decoded))) return false;
        }
        return true;
    }

    return false;
}
