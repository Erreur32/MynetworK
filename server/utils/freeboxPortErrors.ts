// Freebox switch port error counters (GET /switch/port/{id}/stats, marked unstable by Freebox).
// One call per port, so the result is kept 5 min like the other slow Freebox blocks.

type Obj = Record<string, unknown>;
interface Resp { success: boolean; result?: unknown; error_code?: string }

interface Api {
    getSwitchPorts(): Promise<Resp>;
    getSwitchPortStats(id: number): Promise<Resp>;
}

// Counters that mean a frame was damaged, dropped or lost on the wire.
// tx_deferred is left out on purpose: it only means the medium was busy.
export const PORT_ERROR_COUNTERS = [
    'rx_err_packets',
    'rx_fcs_packets',
    'rx_fragments_packets',
    'rx_jabber_packets',
    'rx_oversize_packets',
    'rx_undersize_packets',
    'tx_fcs',
    'tx_collisions',
    'tx_excessive',
    'tx_late',
] as const;

export interface FreeboxPortErrors {
    id: number;
    link: string | null;
    total: number;
    // Only the counters above zero
    causes: Record<string, number>;
}

export interface FreeboxPortErrorsResult {
    total: number;
    ports: FreeboxPortErrors[];
}

const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const count = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);

export function mapPortErrors(id: number, link: unknown, stats: unknown): FreeboxPortErrors {
    const s = isObj(stats) ? stats : {};
    const causes: Record<string, number> = {};
    let total = 0;
    for (const key of PORT_ERROR_COUNTERS) {
        const n = count(s[key]);
        if (n > 0) {
            causes[key] = n;
            total += n;
        }
    }
    return { id, link: typeof link === 'string' ? link : null, total, causes };
}

async function collect(api: Api): Promise<FreeboxPortErrorsResult | null> {
    const ports = await api.getSwitchPorts().catch((): Resp => ({ success: false }));
    if (!ports.success || !Array.isArray(ports.result)) return null;
    const rows: FreeboxPortErrors[] = [];
    for (const p of ports.result.filter(isObj)) {
        const id = typeof p.id === 'number' ? p.id : null;
        if (id === null) continue;
        const stats = await api.getSwitchPortStats(id).catch((): Resp => ({ success: false }));
        // A port that cannot be read is skipped, not reported as error-free
        if (stats.success) rows.push(mapPortErrors(id, p.link, stats.result));
    }
    if (rows.length === 0) return null;
    return { total: rows.reduce((sum, r) => sum + r.total, 0), ports: rows };
}

const TTL_MS = 5 * 60_000;
let cache: { at: number; value: Promise<FreeboxPortErrorsResult | null> } | null = null;

export function getPortErrors(api: Api): Promise<FreeboxPortErrorsResult | null> {
    if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
    const value = collect(api);
    cache = { at: Date.now(), value };
    value.catch(() => { if (cache?.value === value) cache = null; });
    return value;
}
