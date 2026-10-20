// Error counters per Freebox switch port (GET /api/settings/switch/errors)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getPortErrors, mapPortErrors } from '../utils/freeboxPortErrors.js';

test('mapPortErrors keeps only the counters above zero and ignores deferred', () => {
    const port = mapPortErrors(2, 'up', { rx_fcs_packets: 5, tx_collisions: 2, tx_deferred: 900, rx_err_packets: 0, rx_good_packets: 1000 });
    assert.deepEqual(port, { id: 2, link: 'up', total: 7, causes: { rx_fcs_packets: 5, tx_collisions: 2 } });
});

test('mapPortErrors tolerates missing or malformed stats', () => {
    assert.deepEqual(mapPortErrors(1, undefined, null), { id: 1, link: null, total: 0, causes: {} });
    assert.equal(mapPortErrors(1, 'down', { rx_fcs_packets: '12', tx_fcs: -3 }).total, 0);
});

test('getPortErrors sums the ports, skips unreadable ones and caches the result', async () => {
    let statsCalls = 0;
    const api = {
        getSwitchPorts: async () => ({ success: true, result: [{ id: 1, link: 'up' }, { id: 2, link: 'up' }, { id: 3, link: 'down' }] }),
        getSwitchPortStats: async (id: number) => {
            statsCalls += 1;
            if (id === 3) return { success: false };
            return { success: true, result: id === 1 ? { rx_fcs_packets: 4 } : { tx_late: 1 } };
        },
    };
    const first = await getPortErrors(api);
    assert.equal(first?.total, 5);
    assert.deepEqual(first?.ports.map((p) => p.id), [1, 2]);
    await getPortErrors(api);
    assert.equal(statsCalls, 3, 'second call within 5 min is served from the cache');
});
