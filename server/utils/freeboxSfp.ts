// SFP modules of the Freebox (GET /api/settings/sfp): the fibre (WAN) module with its optical power,
// and the SFP LAN ports of the switch. The box reports no temperature or voltage for either.
import { mapFtth } from './freeboxExtras.js';

type Obj = Record<string, unknown>;
interface Resp { success: boolean; result?: unknown }

interface Api {
    getFtthInfo(): Promise<Resp>;
    getSwitchStatus(): Promise<Resp>;
}

export interface FreeboxSfpWan {
    role: 'wan';
    present: boolean | null;
    has_signal: boolean | null;
    link: boolean | null;
    alim_ok: boolean | null;
    link_type: string | null;
    model: string | null;
    vendor: string | null;
    serial: string | null;
    rx_dbm: number | null;
    tx_dbm: number | null;
}

export interface FreeboxSfpLan {
    role: 'lan';
    id: number | null;
    name: string;
    link: string | null;
    // Mbit/s
    speed: number | null;
    mode: string | null;
    // Hostnames of the devices seen behind the port
    hosts: string[];
}

export interface FreeboxSfpResult {
    modules: Array<FreeboxSfpWan | FreeboxSfpLan>;
}

const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

export function mapSfpLanPorts(status: unknown): FreeboxSfpLan[] {
    if (!Array.isArray(status)) return [];
    return status.filter(isObj)
        .filter((p) => typeof p.name === 'string' && /sfp/i.test(p.name))
        .map((p) => {
            const speed = Number(p.speed);
            return {
                role: 'lan' as const,
                id: typeof p.id === 'number' ? p.id : null,
                name: String(p.name),
                link: str(p.link),
                speed: Number.isFinite(speed) ? speed : null,
                mode: str(p.mode),
                hosts: (Array.isArray(p.mac_list) ? p.mac_list : []).filter(isObj).map((m) => str(m.hostname)).filter((h): h is string => h !== null),
            };
        });
}

async function collect(api: Api): Promise<FreeboxSfpResult> {
    const failed: Resp = { success: false };
    const [ftth, status] = await Promise.all([
        api.getFtthInfo().catch(() => failed),
        api.getSwitchStatus().catch(() => failed),
    ]);
    const modules: FreeboxSfpResult['modules'] = [];
    // Boxes without a fibre module (xDSL, 4G backup) answer with an error or sfp_present false
    if (ftth.success && isObj(ftth.result) && ftth.result.has_sfp !== false) {
        const m = mapFtth(ftth.result);
        if (m.sfp_present !== null) {
            modules.push({
                role: 'wan',
                present: m.sfp_present,
                has_signal: m.sfp_has_signal,
                link: m.link,
                alim_ok: m.sfp_alim_ok,
                link_type: m.link_type,
                model: m.sfp_model,
                vendor: m.sfp_vendor,
                serial: str(ftth.result.sfp_serial),
                rx_dbm: m.sfp_pwr_rx,
                tx_dbm: m.sfp_pwr_tx,
            });
        }
    }
    if (status.success) modules.push(...mapSfpLanPorts(status.result));
    return { modules };
}

const TTL_MS = 2 * 60_000;
let cache: { at: number; value: Promise<FreeboxSfpResult> } | null = null;

export function getFreeboxSfp(api: Api): Promise<FreeboxSfpResult> {
    if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
    const value = collect(api);
    cache = { at: Date.now(), value };
    value.catch(() => { if (cache?.value === value) cache = null; });
    return value;
}
