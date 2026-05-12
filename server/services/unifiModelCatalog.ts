/**
 * Static UniFi model catalogue — maps Ubiquiti's opaque `dev.model` codes
 * (e.g. "US24P250", "UDMPRO") to a friendly display name and basic specs.
 *
 * The codes are global: `US24P250` means the same thing on every UniFi
 * controller in the world, so this table is genuinely user-agnostic.
 *
 * Coverage is intentionally NOT exhaustive — we seed the common consumer /
 * prosumer SKUs and rely on the live `port_table` (cached per device via
 * UniFiDeviceSnapshot) plus a generic fallback (deriveDisplayName) for the
 * long tail. Adding a missing entry is a single-line PR.
 *
 * Sources cross-referenced when picking codes:
 *   - Art-of-WiFi/UniFi-API-client (PHP) constants
 *   - jens-maus/node-unifi
 *   - Home Assistant `unifi` integration
 */

export type UniFiFamily = 'gateway' | 'switch' | 'ap' | 'unknown';

export interface UniFiModelSpec {
    code: string;            // canonical (uppercase) UniFi model code
    family: UniFiFamily;
    displayName: string;     // commercial product name
    rj45?: number;           // count of copper RJ45 ports
    sfp?: number;            // count of 1 G SFP ports
    sfpPlus?: number;        // count of 10 G SFP+ ports (or higher)
    poe?: boolean;
    poeBudgetW?: number;
    /** Device has at least one port physically designed as WAN/uplink and
     *  separate from the regular switch ports (UDM-Pro WAN1+WAN2, USG WAN,
     *  USG-Pro-4 WAN1+WAN2…). When true the front-end shows that port as a
     *  separate "Uplink" chip above the card. When false the port serving
     *  as uplink stays inside the regular port grid, just coloured mauve —
     *  reflects switches with no dedicated uplink slot (USW-Lite-8, US-24)
     *  and gateways where any port can be configured as WAN (UDR, UCG-Ultra,
     *  UDM, UXG-Lite). Undefined = unknown → caller falls back on `kind`. */
    hasDedicatedUplink?: boolean;
}

// Normalise UniFi-returned model strings: uppercase + strip non-alphanumeric.
// Some firmware variants emit "us-24-250" vs "US24P250" so canonicalise both
// to the same key.
function normaliseCode(raw: string): string {
    return raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

const CATALOG: Record<string, UniFiModelSpec> = {
    // ── Gateways with a dedicated WAN port ────────────────────────────
    UGW3:      { code: 'UGW3',      family: 'gateway', displayName: 'USG',           rj45: 3,  hasDedicatedUplink: true },
    UGW4:      { code: 'UGW4',      family: 'gateway', displayName: 'USG-Pro-4',     rj45: 4, sfp: 2, hasDedicatedUplink: true },
    UGWXG:     { code: 'UGWXG',     family: 'gateway', displayName: 'USG-XG-8',      rj45: 1, sfpPlus: 8, hasDedicatedUplink: true },
    // UDM-Pro family: 1× RJ45 WAN + 8× RJ45 LAN + 1× SFP+ WAN + 1× SFP+ LAN = 9 RJ45 + 2 SFP+
    UDMP:      { code: 'UDMP',      family: 'gateway', displayName: 'UDM-Pro',       rj45: 9, sfpPlus: 2, hasDedicatedUplink: true },
    UDMPRO:    { code: 'UDMPRO',    family: 'gateway', displayName: 'UDM-Pro',       rj45: 9, sfpPlus: 2, hasDedicatedUplink: true },
    UDMSE:     { code: 'UDMSE',     family: 'gateway', displayName: 'UDM-SE',        rj45: 9, sfpPlus: 2, poe: true, poeBudgetW: 180, hasDedicatedUplink: true },
    UDMPROMAX: { code: 'UDMPROMAX', family: 'gateway', displayName: 'UDM-Pro-Max',   rj45: 9, sfpPlus: 2, hasDedicatedUplink: true },
    UXGPRO:    { code: 'UXGPRO',    family: 'gateway', displayName: 'UXG-Pro',       rj45: 4, sfpPlus: 4, hasDedicatedUplink: true },

    // ── Gateways where any port can be configured as WAN ──────────────
    // (port 1 is WAN by default but physically identical to LAN ports;
    //  rendering should keep the active uplink port inside the grid)
    UDM:       { code: 'UDM',       family: 'gateway', displayName: 'UDM',           rj45: 5, hasDedicatedUplink: false },
    UDMB:      { code: 'UDMB',      family: 'gateway', displayName: 'UDM',           rj45: 5, hasDedicatedUplink: false },
    UDR:       { code: 'UDR',       family: 'gateway', displayName: 'UDR',           rj45: 5, hasDedicatedUplink: false },
    UXGLITE:   { code: 'UXGLITE',   family: 'gateway', displayName: 'UXG-Lite',      rj45: 5, hasDedicatedUplink: false },

    // ── Switches: US legacy line ──────────────────────────────────────
    US8:       { code: 'US8',       family: 'switch',  displayName: 'US-8',          rj45: 8 },
    US8P60:    { code: 'US8P60',    family: 'switch',  displayName: 'US-8-60W',      rj45: 8, poe: true, poeBudgetW: 60 },
    US8P150:   { code: 'US8P150',   family: 'switch',  displayName: 'US-8-150W',     rj45: 8, sfp: 2, poe: true, poeBudgetW: 150 },
    US16P150:  { code: 'US16P150',  family: 'switch',  displayName: 'USW-16-PoE',    rj45: 16, sfp: 2, poe: true, poeBudgetW: 150 },
    US24:      { code: 'US24',      family: 'switch',  displayName: 'US-24',         rj45: 24, sfp: 2 },
    US24P250:  { code: 'US24P250',  family: 'switch',  displayName: 'US-24-250W',    rj45: 24, sfp: 2, poe: true, poeBudgetW: 250 },
    US24P500:  { code: 'US24P500',  family: 'switch',  displayName: 'US-24-500W',    rj45: 24, sfp: 2, poe: true, poeBudgetW: 500 },
    US48:      { code: 'US48',      family: 'switch',  displayName: 'US-48',         rj45: 48, sfp: 2, sfpPlus: 2 },
    US48P500:  { code: 'US48P500',  family: 'switch',  displayName: 'US-48-500W',    rj45: 48, sfp: 2, sfpPlus: 2, poe: true, poeBudgetW: 500 },
    US48P750:  { code: 'US48P750',  family: 'switch',  displayName: 'US-48-750W',    rj45: 48, sfp: 2, sfpPlus: 2, poe: true, poeBudgetW: 750 },

    // ── Switches: USW Lite / Flex / Mini ──────────────────────────────
    USL8:      { code: 'USL8',      family: 'switch',  displayName: 'USW-Lite-8',    rj45: 8 },
    USL8P60:   { code: 'USL8P60',   family: 'switch',  displayName: 'USW-Lite-8-PoE', rj45: 8, poe: true, poeBudgetW: 60 },
    USL16:     { code: 'USL16',     family: 'switch',  displayName: 'USW-Lite-16',   rj45: 16 },
    USL16P:    { code: 'USL16P',    family: 'switch',  displayName: 'USW-Lite-16-PoE', rj45: 16, poe: true, poeBudgetW: 45 },
    USMINI:    { code: 'USMINI',    family: 'switch',  displayName: 'USW-Flex-Mini', rj45: 5 },
    USFXG:     { code: 'USFXG',     family: 'switch',  displayName: 'USW-Flex-XG',   rj45: 1, sfpPlus: 4 },

    // ── Switches: USW Pro line ────────────────────────────────────────
    USPL24:    { code: 'USPL24',    family: 'switch',  displayName: 'USW-Pro-24',     rj45: 24, sfpPlus: 2 },
    USPL24P:   { code: 'USPL24P',   family: 'switch',  displayName: 'USW-Pro-24-PoE', rj45: 24, sfpPlus: 2, poe: true, poeBudgetW: 400 },
    USPL48:    { code: 'USPL48',    family: 'switch',  displayName: 'USW-Pro-48',     rj45: 48, sfpPlus: 4 },
    USPL48P:   { code: 'USPL48P',   family: 'switch',  displayName: 'USW-Pro-48-PoE', rj45: 48, sfpPlus: 4, poe: true, poeBudgetW: 600 },

    // ── Switches: Aggregation ─────────────────────────────────────────
    USXG:      { code: 'USXG',      family: 'switch',  displayName: 'USW-Aggregation', sfpPlus: 8 },
    USPRPS:    { code: 'USPRPS',    family: 'switch',  displayName: 'USW-Pro-Aggregation', sfpPlus: 4 },

    // ── APs: Wi-Fi 5 (UAP-AC family) ──────────────────────────────────
    BZ2:       { code: 'BZ2',       family: 'ap',      displayName: 'UAP-AC-Pro' },
    BZ2LR:     { code: 'BZ2LR',     family: 'ap',      displayName: 'UAP-AC-LR' },
    U7P:       { code: 'U7P',       family: 'ap',      displayName: 'UAP-AC-Pro' },
    U7PG2:     { code: 'U7PG2',     family: 'ap',      displayName: 'UAP-AC-Pro Gen2' },
    U7LT:      { code: 'U7LT',      family: 'ap',      displayName: 'UAP-AC-Lite' },
    U7LR:      { code: 'U7LR',      family: 'ap',      displayName: 'UAP-AC-LR' },
    U7MSH:     { code: 'U7MSH',     family: 'ap',      displayName: 'UAP-AC-Mesh' },
    U7HD:      { code: 'U7HD',      family: 'ap',      displayName: 'UAP-AC-SHD' },
    U7NHD:     { code: 'U7NHD',     family: 'ap',      displayName: 'UAP-nanoHD' },
    U7IW:      { code: 'U7IW',      family: 'ap',      displayName: 'UAP-AC-IW' },

    // ── APs: Wi-Fi 6 (U6 family) ──────────────────────────────────────
    UAL6:      { code: 'UAL6',      family: 'ap',      displayName: 'U6-Lite' },
    U6P:       { code: 'U6P',       family: 'ap',      displayName: 'U6-Pro' },
    U6LR:      { code: 'U6LR',      family: 'ap',      displayName: 'U6-LR' },
    U6M:       { code: 'U6M',       family: 'ap',      displayName: 'U6-Mesh' },
    U6IW:      { code: 'U6IW',      family: 'ap',      displayName: 'U6-IW' },
    U6E:       { code: 'U6E',       family: 'ap',      displayName: 'U6-Enterprise' },
    U6ENT:     { code: 'U6ENT',     family: 'ap',      displayName: 'U6-Enterprise' },

    // ── APs: Wi-Fi 7 ──────────────────────────────────────────────────
    UAL7P:     { code: 'UAL7P',     family: 'ap',      displayName: 'U7-Pro' }
};

export function lookupUniFiModel(rawCode: string | undefined | null): UniFiModelSpec | undefined {
    if (!rawCode || typeof rawCode !== 'string') return undefined;
    return CATALOG[normaliseCode(rawCode)];
}

export function totalPortsFor(spec: UniFiModelSpec): number {
    return (spec.rj45 ?? 0) + (spec.sfp ?? 0) + (spec.sfpPlus ?? 0);
}

/**
 * Build a display name when the catalogue has no entry for this model code.
 *
 * Priority:
 *   1. The host's reported hostname (if it looks like a meaningful name, not
 *      just an IP / MAC / numeric blob — scan-reseau often surfaces good ones
 *      like "usw-pro-24-poe.local").
 *   2. A generic name derived from family + port count: "UniFi Switch (24 ports)".
 *   3. Last resort: family + raw code, then just family.
 */
export function deriveDisplayName(
    rawCode: string | undefined,
    family: UniFiFamily,
    portCount: number | undefined,
    hostname: string | undefined
): string {
    if (hostname && hostname.trim().length > 0 && !/^[\d.:a-f-]+$/i.test(hostname)) {
        return hostname;
    }
    const familyLabel = {
        gateway: 'Gateway',
        switch: 'Switch',
        ap: 'AP',
        unknown: 'Device'
    }[family];
    if (typeof portCount === 'number' && portCount > 0) {
        return `UniFi ${familyLabel} (${portCount} ports)`;
    }
    if (rawCode) return `UniFi ${familyLabel} (${rawCode})`;
    return `UniFi ${familyLabel}`;
}
