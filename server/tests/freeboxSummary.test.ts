// Compact Freebox summary served to API tokens: keeps line and health, drops identifiers
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeFreebox } from '../utils/freeboxSummary.js';

test('summarizeFreebox keeps line state and health, drops IP, serial and MAC', () => {
    const out = summarizeFreebox(
        { state: 'up', media: 'ftth', type: 'ethernet', ipv4: '203.0.113.7', rate_down: 1200, bandwidth_down: 8000000000 },
        { box_model_name: 'Freebox Ultra', firmware_version: '4.9.4', uptime_val: 86400, serial: 'X', mac: 'M',
          sensors: [{ id: 'temp_cpu0', name: 'CPU 0', value: 52 }, { id: 'bad', value: 'n/a' }], fans: [{ id: 'fan0', name: 'Ventilateur', value: 1800 }] });
    assert.equal(out.connection.state, 'up');
    assert.equal(out.connection.bandwidth_down, 8000000000);
    assert.equal(out.system.model, 'Freebox Ultra');
    assert.deepEqual(out.system.sensors, [{ id: 'temp_cpu0', name: 'CPU 0', value: 52 }]);
    const s = JSON.stringify(out);
    for (const leak of ['203.0.113.7', '"serial"', '"mac"']) assert.equal(s.includes(leak), false, leak);
});

test('summarizeFreebox tolerates missing data', () => {
    const out = summarizeFreebox(null, undefined);
    assert.equal(out.connection.state, null);
    assert.deepEqual(out.system.sensors, []);
});
