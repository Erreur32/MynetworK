// Compact UniFi device summary served to API tokens (MyServices): firmware update, gateway LAN IP, health
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeDevice, summarizeSystem } from '../mcp/tools/unifi.js';

test('summarizeDevice reports an available firmware update', () => {
    const out = summarizeDevice({ type: 'uap', version: '6.6.77', upgradable: true, upgrade_to_firmware: '6.7.31' });
    assert.equal(out.upgradable, true);
    assert.equal(out.upgrade_to_firmware, '6.7.31');
    assert.equal(out.lan_ip, undefined);
});

test('summarizeDevice tells up to date (false) from unknown (null)', () => {
    const upToDate = summarizeDevice({ type: 'usw', version: '7.0.50', upgradable: false, upgrade_to_firmware: '7.0.50' });
    assert.equal(upToDate.upgradable, false);
    assert.equal(upToDate.upgrade_to_firmware, null);
    const unknown = summarizeDevice({ type: 'usw', version: '7.0.50' });
    assert.equal(unknown.upgradable, null);
    assert.equal(unknown.upgrade_to_firmware, null);
    // null must survive serialization, unlike undefined
    assert.match(JSON.stringify(unknown), /"upgradable":null,"upgrade_to_firmware":null/);
});

test('summarizeDevice exposes the gateway LAN IP and numeric health', () => {
    const out = summarizeDevice({
        type: 'udm', ip: '192.168.1.2',
        network_table: [
            { purpose: 'corporate', name: 'IoT', ip: '192.168.40.1' },
            { purpose: 'corporate', name: 'Default', ip: '192.168.32.1', attr_no_delete: true }
        ],
        'system-stats': { cpu: '88.1', mem: '41' },
        temperatures: [{ name: 'CPU', value: 61.5 }, { name: 'Local', value: 48 }]
    });
    assert.equal(out.ip, '192.168.1.2');
    assert.equal(out.lan_ip, '192.168.32.1');
    assert.equal(out.cpu_pct, 88.1);
    assert.equal(out.mem_pct, 41);
    assert.equal(out.temperature, 61.5);
});

test('summarizeDevice falls back to config_network.ip, then null', () => {
    assert.equal(summarizeDevice({ type: 'ugw', config_network: { ip: '10.0.0.1' } }).lan_ip, '10.0.0.1');
    assert.equal(summarizeDevice({ type: 'uxg' }).lan_ip, null);
});

test('summarizeSystem keeps version, update and gateway health, drops SSO secrets and controller IPs', () => {
    const out = summarizeSystem(
        { name: 'UniFi Network', hostname: 'udm', version: '9.4.19', update_available: true, udm_version: '4.3.6',
          uptime: '864000', sso_app_sec: 'S3CR3T', sso_app_id: 'APPID', ip_addrs: ['192.168.1.2'] },
        [
            { type: 'uap', name: 'AP' },
            { type: 'udm', name: 'UDM Pro', version: '4.3.6', upgradable: false, general_temperature: 58,
              config_network: { ip: '192.168.32.1' }, 'system-stats': { cpu: '12.4', mem: '61.2' }, sys_stats: { mem_total: 4096, mem_used: 2048 } }
        ]);
    assert.equal(out.version, '9.4.19');
    assert.equal(out.update_available, true);
    assert.equal(out.update_downloaded, null);
    assert.equal(out.console_version, '4.3.6');
    assert.equal(out.uptime, 864000);
    assert.equal(out.gateway?.name, 'UDM Pro');
    assert.equal(out.gateway?.lan_ip, '192.168.32.1');
    assert.equal(out.gateway?.temperature, 58);
    assert.equal(out.gateway?.mem_used, 2048);
    const s = JSON.stringify(out);
    for (const leak of ['S3CR3T', 'APPID', '192.168.1.2']) assert.equal(s.includes(leak), false, leak);
});

test('summarizeSystem tolerates a software controller and an empty sysinfo', () => {
    const out = summarizeSystem({}, [{ type: 'usw' }]);
    assert.equal(out.gateway, null);
    assert.equal(out.version, null);
    assert.equal(out.update_available, null);
});
