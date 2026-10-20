// SFP transceiver readings of a UniFi port table (sfp_* fields), for the MCP summary.
// The UI grades the same fields in src/vendor/unifi-device-card/mynetwork-sfp.js, keep the module kind rule in sync.

// A copper (10GBASE-T) module reports placeholder optical power, so its signal is left out.
const COPPER = /(^|[-_ ])T$|BASE-?T\b|RJ-?45|COPPER/i;

const num = (v: unknown): number | undefined => {
    if (v === undefined || v === null || v === '') return undefined;
    const n = Number(typeof v === 'string' ? v.replace(',', '.') : v);
    return Number.isFinite(n) ? n : undefined;
};
const text = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined);
const round = (n: number | undefined, digits: number): number | undefined => (n === undefined ? undefined : Number(n.toFixed(digits)));

export interface SfpModule {
    port?: number;
    kind: 'electrical' | 'optical';
    vendor?: string;
    part?: string;
    compliance?: string;
    temperature_c?: number;
    voltage_v?: number;
    current_ma?: number;
    rx_dbm?: number;
    tx_dbm?: number;
    rx_los?: boolean;
    tx_fault?: boolean;
}

export function summarizeSfpModules(ports: unknown): SfpModule[] {
    if (!Array.isArray(ports)) return [];
    return ports.flatMap((row: any): SfpModule[] => {
        if (row?.sfp_found !== true) return [];
        const part = text(row.sfp_part);
        const compliance = text(row.sfp_compliance);
        const electrical = COPPER.test(part ?? '') || COPPER.test(compliance ?? '');
        return [{
            port: num(row.port_idx),
            kind: electrical ? 'electrical' : 'optical',
            vendor: text(row.sfp_vendor),
            part,
            compliance,
            temperature_c: round(num(row.sfp_temperature), 1),
            voltage_v: round(num(row.sfp_voltage), 2),
            current_ma: round(num(row.sfp_current), 1),
            rx_dbm: electrical ? undefined : round(num(row.sfp_rxpower), 2),
            tx_dbm: electrical ? undefined : round(num(row.sfp_txpower), 2),
            rx_los: row.sfp_rx_los === true || row.sfp_rxfault === true,
            tx_fault: row.sfp_tx_fault === true || row.sfp_txfault === true,
        }];
    });
}
