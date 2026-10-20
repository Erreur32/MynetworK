// Freebox SFP modules: fibre module + SFP LAN ports (GET /api/settings/sfp)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getFreeboxSfp, mapSfpLanPorts } from '../utils/freeboxSfp.js';

const ftth = { has_sfp: true, sfp_present: true, sfp_has_signal: true, link: true, sfp_alim_ok: true, link_type: 'pon', sfp_model: 'LTF7219-BC+1', sfp_vendor: 'Hisense', sfp_serial: 'UVLDB008346', sfp_pwr_rx: -1576, sfp_pwr_tx: 645, wan_ip: '203.0.113.7' };
const status = [
    { id: 1, name: 'Ethernet 1', link: 'down', speed: '10' },
    { id: 9999, name: 'Sfp lan', link: 'up', speed: '10000', mode: '10000-FD', mac_list: [{ mac: 'AA:BB:CC:DD:EE:FF', hostname: 'Cloud Gateway' }] },
];

test('mapSfpLanPorts keeps only SFP ports, with hostnames but no MAC addresses', () => {
    const [port, ...rest] = mapSfpLanPorts(status);
    assert.equal(rest.length, 0);
    assert.deepEqual(port, { role: 'lan', id: 9999, name: 'Sfp lan', link: 'up', speed: 10000, mode: '10000-FD', hosts: ['Cloud Gateway'] });
    assert.deepEqual(mapSfpLanPorts(null), []);
});

test('getFreeboxSfp lists the fibre module in dBm without line IPs, and caches the answer', async () => {
    let calls = 0;
    const api = {
        getFtthInfo: async () => { calls += 1; return { success: true, result: ftth }; },
        getSwitchStatus: async () => ({ success: true, result: status }),
    };
    const result = await getFreeboxSfp(api);
    assert.deepEqual(result.modules.map((m) => m.role), ['wan', 'lan']);
    const wan: any = result.modules[0];
    assert.equal(wan.rx_dbm, -15.76);
    assert.equal(wan.serial, 'UVLDB008346');
    assert.equal(JSON.stringify(result).includes('203.0.113.7'), false);
    await getFreeboxSfp(api);
    assert.equal(calls, 1);
});
