// Summary extras: live blocks refreshed every 30 s, slow blocks kept 5 min and
// dropped by a write; VM disk sizes follow their VM by disk path.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { getExtras } from '../utils/freeboxExtras.js';

function fakeApi() {
    const calls: Record<string, number> = {};
    let generation = 0;
    let vms = [{ id: 1, name: 'a', disk_path: '/a.qcow2' }, { id: 2, name: 'b', disk_path: '/b.qcow2' }];
    const ok = (name: string, result: unknown) => async () => {
        calls[name] = (calls[name] ?? 0) + 1;
        return { success: true, result };
    };
    const api = {
        getSwitchStatus: ok('switch', []),
        getLanBrowserInterfaces: ok('interfaces', [{ name: 'pub' }]),
        getLanHosts: async () => { calls.hosts = (calls.hosts ?? 0) + 1; return { success: true, result: [{ active: true }] }; },
        getDhcpConfig: ok('dhcp', {}),
        getWifiBss: ok('bss', []),
        getVmInfo: ok('vmInfo', {}),
        getVmDiskInfo: async (path: string) => {
            calls.vmDisk = (calls.vmDisk ?? 0) + 1;
            return { success: true, result: { virtual_size: path === '/a.qcow2' ? 10 : 20, actual_size: 1 } };
        },
        getLanConfig: ok('lan', { ip: '192.168.1.254' }),
        getDisks: ok('disks', []),
        getFtthInfo: ok('ftth', {}),
        getWifiConfig: ok('wifiConfig', { enabled: true }),
        getWifiAps: ok('aps', []),
        getWifiStations: ok('stations', []),
        getVms: async () => { calls.vms = (calls.vms ?? 0) + 1; return { success: true, result: vms }; },
        getWriteGeneration: () => generation,
    };
    return {
        api,
        calls,
        write: () => { generation++; },
        reorderVms: () => { vms = [vms[1], vms[0]]; },
    };
}

test('slow blocks outlive the 30 s live cache, writes drop them, disk sizes follow the VM', async () => {
    mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
    try {
        const { api, calls, write, reorderVms } = fakeApi();

        await getExtras(api, null);
        assert.equal(calls.disks, 1);
        assert.equal(calls.stations, 1);

        // Live cache expired, slow cache still valid: only live blocks are fetched again
        mock.timers.tick(31_000);
        reorderVms();
        const second = await getExtras(api, null);
        assert.equal(calls.disks, 1);
        assert.equal(calls.stations, 2);
        assert.equal(calls.vmDisk, 2);
        assert.deepEqual(second.vms?.map((v) => [v.name, v.disk_total_bytes]), [['b', 20], ['a', 10]]);

        // A write to the box drops the slow blocks at the next live refresh
        write();
        mock.timers.tick(31_000);
        await getExtras(api, null);
        assert.equal(calls.disks, 2);

        // Past 5 minutes the slow blocks are fetched again
        mock.timers.tick(5 * 60_000 + 1);
        await getExtras(api, null);
        assert.equal(calls.disks, 3);
    } finally {
        mock.timers.reset();
    }
});
