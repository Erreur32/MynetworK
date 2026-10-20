import { useState } from 'react';
import { api } from '../api/client';
import { usePolling } from './usePolling';
import type { SfpLevel } from '../vendor/unifi-device-card/mynetwork-sfp.js';

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
    speed: number | null;
    mode: string | null;
    hosts: string[];
}

export interface FreeboxSfpResult {
    modules: Array<FreeboxSfpWan | FreeboxSfpLan>;
}

// PON receivers work down to about -27 dBm (GPON class B+), far below the 10G Ethernet optics.
export const PON_RX_WARN_DBM = -24;
export const PON_RX_CRIT_DBM = -27;

export const wanSignalLevel = (m: FreeboxSfpWan): SfpLevel => {
    if (m.present === false || m.has_signal === false || m.alim_ok === false || m.link === false) return 'crit';
    if (m.rx_dbm === null) return 'ok';
    return m.rx_dbm < PON_RX_CRIT_DBM ? 'crit' : m.rx_dbm < PON_RX_WARN_DBM ? 'warn' : 'ok';
};

// The box is asked at most every 2 min (server cache), only while `enabled`.
export function useFreeboxSfp(enabled: boolean): FreeboxSfpResult | null {
    const [sfp, setSfp] = useState<FreeboxSfpResult | null>(null);
    usePolling(async () => {
        const res = await api.get<FreeboxSfpResult>('/api/settings/sfp').catch(() => null);
        if (res?.success) setSfp(res.result ?? null);
    }, { enabled, interval: 2 * 60_000 });
    return sfp;
}
