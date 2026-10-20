import { useState } from 'react';
import { api } from '../api/client';
import { usePolling } from './usePolling';
import type { SfpLevel } from '../vendor/unifi-device-card/mynetwork-sfp.js';
// Type-only: the response shape is defined once, next to the route that builds it
import type { FreeboxSfpLan, FreeboxSfpResult, FreeboxSfpWan } from '../../server/utils/freeboxSfp';

export type { FreeboxSfpLan, FreeboxSfpResult, FreeboxSfpWan };

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
