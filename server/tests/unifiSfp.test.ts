// SFP transceiver readings: electrical vs optical, grading, MCP summary
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeSfpModules } from '../utils/unifiSfp.js';
import { readSfp } from '../../src/vendor/unifi-device-card/mynetwork-sfp.js';
import { mapFtth } from '../utils/freeboxExtras.js';
import { summarizeCardDevice } from '../mcp/tools/unifi.js';

// Real shapes: a gateway sends numbers, a switch sends strings.
const gatewayElectrical = { port_idx: 7, sfp_found: true, sfp_part: 'SFP-10G-T', sfp_vendor: 'OEM', sfp_temperature: 87.05, sfp_voltage: 3.33, sfp_current: 6, sfp_rxpower: -3.98, sfp_txpower: -3.01, sfp_rx_los: false, sfp_tx_fault: false };
const switchOptical = { port_idx: 10, sfp_found: true, sfp_part: '8SN-400', sfp_vendor: 'AccedianNetworks', sfp_compliance: '10G BASE-LR', sfp_temperature: '62.059', sfp_voltage: '3.276', sfp_current: '32.768', sfp_txpower: '-2.70', sfp_rxpower: '-2.12', sfp_rxfault: false, sfp_txfault: false };

test('readSfp tells a copper module from an optical one and drops the copper power readings', () => {
    const electrical = readSfp(gatewayElectrical)!;
    assert.equal(electrical.kind, 'electrical');
    assert.equal(electrical.rx, undefined);
    assert.equal(electrical.tempLevel, 'crit');
    const optical = readSfp(switchOptical)!;
    assert.equal(optical.kind, 'optical');
    assert.equal(optical.temperature, 62.059);
    assert.equal(optical.rx, -2.12);
    assert.equal(optical.level, 'ok');
});

test('readSfp grades temperature, receive power and faults', () => {
    assert.equal(readSfp({ ...switchOptical, sfp_temperature: '72' })!.level, 'warn');
    assert.equal(readSfp({ ...switchOptical, sfp_rxpower: '-15' })!.signalLevel, 'warn');
    assert.equal(readSfp({ ...switchOptical, sfp_rxpower: '-19' })!.signalLevel, 'crit');
    assert.equal(readSfp({ ...switchOptical, sfp_rxfault: true })!.level, 'crit');
    assert.equal(readSfp({ port_idx: 10, sfp_found: false }), null);
});

test('summarizeSfpModules mirrors the kind rule and ignores empty ports', () => {
    const modules = summarizeSfpModules([{ port_idx: 1, up: true }, gatewayElectrical, switchOptical]);
    assert.deepEqual(modules.map((m) => [m.port, m.kind]), [[7, 'electrical'], [10, 'optical']]);
    assert.equal(modules[0].rx_dbm, undefined);
    assert.equal(modules[1].rx_dbm, -2.12);
    assert.equal(modules[1].temperature_c, 62.1);
    assert.deepEqual(summarizeSfpModules(undefined), []);
});

test('card-devices keeps the sfp readings as numbers and leaves the serial out', () => {
    const device = summarizeCardDevice({ mac: 'aa:bb:cc:dd:ee:ff', type: 'usw', port_table: [{ ...switchOptical, sfp_serial: 'K0818PC2500218' }] }, new Set());
    const port: any = device.port_table[0];
    assert.equal(port.sfp_found, true);
    assert.equal(port.sfp_rxpower, -2.12);
    assert.equal('sfp_serial' in port, false);
});

test('mapFtth keeps the module identity but not the serial number', () => {
    const ftth = mapFtth({ sfp_present: true, sfp_has_signal: true, link: true, sfp_pwr_rx: -1576, sfp_pwr_tx: 645, sfp_model: 'LTF7219-BC+1', sfp_vendor: 'Hisense', sfp_alim_ok: true, link_type: 'pon', sfp_serial: 'UVLDB008346' });
    assert.equal(ftth.sfp_pwr_rx, -15.76);
    assert.equal(ftth.sfp_model, 'LTF7219-BC+1');
    assert.equal(ftth.link_type, 'pon');
    assert.equal('sfp_serial' in ftth, false);
});
