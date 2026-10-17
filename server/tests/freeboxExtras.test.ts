import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mapDhcp, mapWifiNetworks, mapVmSystem } from '../utils/freeboxExtras.js';
import { firmwareBlock, healthBlock, summarizeFreebox } from '../utils/freeboxSummary.js';

describe('freeboxExtras', () => {
    it('mapDhcp keeps only the allowlisted fields', () => {
        const out = mapDhcp({ enabled: true, ip_range_start: '192.168.1.10', ip_range_end: '192.168.1.200', gateway: '192.168.1.254', netmask: '255.255.255.0', dns: ['1.1.1.1', '', 5], sticky_assign: true });
        assert.deepEqual(out, { enabled: true, ip_range_start: '192.168.1.10', ip_range_end: '192.168.1.200', gateway: '192.168.1.254', netmask: '255.255.255.0', dns: ['1.1.1.1'] });
    });

    it('mapWifiNetworks skips the guest BSS of a radio and never exposes the key', () => {
        const bss = [
            { id: 'a', phy_id: 0, status: { is_main_bss: true, state: 'active' }, config: { enabled: true, ssid: 'Home', hide_ssid: false, key: 'secret' } },
            { id: 'b', phy_id: 0, status: { is_main_bss: false, state: 'active' }, config: { enabled: true, ssid: 'Guest' } },
        ];
        const out = mapWifiNetworks(bss, [{ id: 0, config: { band: '5g' } }]);
        assert.deepEqual(out, [{ ssid: 'Home', enabled: true, hidden: false, state: 'active', band: '5g' }]);
        assert.ok(!JSON.stringify(out).includes('secret'));
    });

    it('mapVmSystem computes percentages, null when the total is unknown', () => {
        assert.equal(mapVmSystem({ total_memory: 8192, used_memory: 2048, total_cpus: 4, used_cpus: 2 }).memory_pct, 25);
        assert.equal(mapVmSystem({}).cpu_pct, null);
    });

    it('firmwareBlock is null without check, and flags a pending update', () => {
        assert.equal(firmwareBlock(null, '4.9.4'), null);
        const out = firmwareBlock({ server: { latestVersion: '4.9.16', changelog: 'x', date: '1 oct', blogUrl: 'u' }, player: null, lastCheck: 'now' }, '4.9.4');
        assert.equal(out?.server?.update_available, true);
        assert.equal(out?.player, null);
    });

    it('healthBlock groups sensors, disk and line state', () => {
        const base = summarizeFreebox({ state: 'up' }, { sensors: [{ id: 't', name: 'CPU', value: 60 }, { id: 'u', name: 'Disk', value: 70 }], fans: [] });
        const out = healthBlock(base, { partitions: [{ used_pct: 55 }, { used_pct: null }] }, { sfp_has_signal: true, link: true });
        assert.equal(out.max_temperature, 70);
        assert.equal(out.max_used_pct, 55);
        assert.equal(out.line_up, true);
        assert.equal(out.fibre_signal, true);
    });
});
