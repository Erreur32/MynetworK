// Projection served by GET /api/plugins/unifi/card-devices (front-panel cards, MyServices)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeCardDevices } from '../mcp/tools/unifi.js';

const SWITCH_MAC = 'aa:bb:cc:00:00:02';
const GATEWAY_MAC = 'aa:bb:cc:00:00:01';

const switchDevice = {
    mac: SWITCH_MAC, name: 'Plex', type: 'usw', model: 'USWED37', model_name: 'USW Flex 2.5G 8 PoE', hw_version: '1', ip: '192.168.32.4',
    state: 1, version: '7.0.50', uptime: 12345, num_sta: '4', general_temperature: 41,
    'system-stats': { cpu: '13.2', mem: '40.5', temps: { CPU: '48' } },
    uplink: { type: 'wire', uplink_mac: GATEWAY_MAC, uplink_remote_port: 6, port_idx: 10, speed: 10000, ip: '10.0.0.9' },
    upgradable: true, upgrade_to_firmware: '7.0.66',
    x_authkey: 'SECRET', x_ssh_password: 'SECRET', x_aes_gcm: true, x_fingerprint: 'SECRET',
    port_table: [
        { port_idx: 1, name: 'Port 1', ifname: 'eth0', up: true, speed: 2500, media: 'GE', port_poe: true, poe_enable: true, poe_power: '3.20',
          'rx_bytes-r': 11116, 'tx_bytes-r': 185617, lldp_table: [{ chassis_id: 'de:ad:be:ef:00:01', chassis_name: 'nas' }] },
        { port_idx: 10, name: 'SFP+ 1', up: true, speed: 10000, media: 'SFP+', is_uplink: true,
          lldp_table: [{ chassis_id: GATEWAY_MAC.toUpperCase(), chassis_name: 'gateway' }], x_password: 'SECRET' }
    ]
};

const gatewayDevice = {
    mac: GATEWAY_MAC, name: 'Cloud Gateway', type: 'udm', model: 'UCGFIBER', ip: '203.0.113.7', state: 1,
    network_table: [{ purpose: 'corporate', ip: '192.168.32.1', attr_no_delete: true }],
    wan1: { name: 'WAN', ifname: 'eth6', up: true, speed: 10000, ip: '203.0.113.7', gateway: '203.0.113.1', dns: ['1.1.1.1'], type: 'wire' },
    port_table: [{ port_idx: 5, name: 'WAN', up: true, speed: 10000 }]
};

const apDevice = { mac: 'aa:bb:cc:00:00:03', name: 'AP salon', type: 'uap', model: 'U6LR', ip: '192.168.32.5', state: 1, num_sta: 7 };
const client = { mac: 'de:ad:be:ef:00:09', type: 'client', ip: '192.168.32.50' };

const out = summarizeCardDevices([switchDevice, gatewayDevice, apDevice, client]);
const sw = out.find((d) => d.mac === SWITCH_MAC)!;
const gw = out.find((d) => d.mac === GATEWAY_MAC)!;
const ap = out.find((d) => d.type === 'uap')!;

test('only switches, gateways and access points are returned, never clients', () => {
    assert.equal(out.length, 3);
    assert.ok(!out.some((d) => d.mac === client.mac));
});

test('switch: identity, numbers are real numbers and port_table has one row per port', () => {
    assert.equal(sw.model, 'USWED37');
    assert.equal(sw.model_name, 'USW Flex 2.5G 8 PoE');
    assert.equal(sw.state, 1);
    assert.equal(sw.num_sta, 4);
    assert.deepEqual(sw['system-stats'], { cpu: 13.2, mem: 40.5, temps: { CPU: 48 } });
    assert.deepEqual(sw.uplink, { type: 'wire', uplink_mac: GATEWAY_MAC, uplink_remote_port: 6, port_idx: 10, speed: 10000 });
    assert.equal(sw.port_table.length, 2);
    const row = sw.port_table[0];
    assert.equal(row.poe_power, 3.2);
    assert.equal(row['rx_bytes-r'], 11116);
    assert.equal(row['tx_bytes-r'], 185617);
    assert.equal(row.up, true);
    assert.equal(sw.port_table[1].is_uplink, true);
});

test('LLDP neighbours are kept only when they are known UniFi devices', () => {
    assert.equal(sw.port_table[0].lldp_table, undefined);
    assert.deepEqual(sw.port_table[1].lldp_table, [{ chassis_id: GATEWAY_MAC.toUpperCase() }]);
});

test('gateway: only the LAN address is exposed, WAN links carry no address', () => {
    assert.equal(gw.ip, '192.168.32.1');
    assert.deepEqual(gw.wan1, { name: 'WAN', ifname: 'eth6', port_idx: undefined, up: true, speed: 10000, type: 'wire' });
    assert.ok(!JSON.stringify(out).includes('203.0.113'));
    assert.ok(!JSON.stringify(out).includes('1.1.1.1'));
});

test('access point without ports: absent fields are omitted, not invented', () => {
    assert.deepEqual(ap.port_table, []);
    const json = JSON.parse(JSON.stringify(ap));
    assert.equal(json.uplink, undefined);
    assert.equal(json.uptime, undefined);
    assert.equal(json['system-stats'], undefined);
    assert.equal(json.num_sta, 7);
});

test('no credential-like key leaves the projection, at any depth', () => {
    const keys: string[] = [];
    const walk = (v: unknown) => {
        if (Array.isArray(v)) v.forEach(walk);
        else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { keys.push(k); walk(x); }
    };
    walk(JSON.parse(JSON.stringify(out)));
    const sensitive = keys.filter((k) => /key|pass|secret|token|auth|psk|cookie/i.test(k) || k.startsWith('x_'));
    assert.deepEqual(sensitive, []);
    assert.ok(!JSON.stringify(out).includes('SECRET'));
});

test('the ethernet port tables are accepted when port_table is empty', () => {
    const [d] = summarizeCardDevices([{ mac: 'aa:bb:cc:00:00:09', type: 'usw', port_table: [], eth_port_table: [{ port_idx: 1, up: false }] }]);
    assert.equal(d.port_table.length, 1);
});

test('port error and drop counters are kept when reported, never invented', () => {
    const [d] = summarizeCardDevices([{ mac: 'aa:bb:cc:00:00:0a', type: 'usw', port_table: [
        { port_idx: 1, up: true, rx_errors: 12, tx_errors: 0, tx_dropped: '3' },
        { port_idx: 2, up: true }
    ] }]);
    const [withCounters, without] = d.port_table;
    assert.equal(withCounters.rx_errors, 12);
    assert.equal(withCounters.tx_errors, 0);
    assert.equal(withCounters.rx_dropped, undefined);
    assert.equal(withCounters.tx_dropped, 3);
    const json = JSON.parse(JSON.stringify(without));
    for (const k of ['rx_errors', 'tx_errors', 'rx_dropped', 'tx_dropped']) assert.ok(!(k in json), k);
});
