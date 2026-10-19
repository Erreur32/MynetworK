// Upstream call counters: endpoint normalisation and call/cache/shared totals.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
    normalizeUpstreamEndpoint,
    recordUpstream,
    getUpstreamStats,
    resetUpstreamStats,
} from '../utils/upstreamCallStats.js';

beforeEach(() => resetUpstreamStats());

test('folds sites, ids and MACs into one endpoint', () => {
    assert.equal(normalizeUpstreamEndpoint('GET /api/s/default/stat/device'), 'GET /api/s/:site/stat/device');
    assert.equal(normalizeUpstreamEndpoint('GET /vm/3/'), 'GET /vm/:id/');
    assert.equal(normalizeUpstreamEndpoint('GET /lan/browser/pub/aa:bb:cc:dd:ee:ff/'), 'GET /lan/browser/pub/:mac/');
    assert.equal(normalizeUpstreamEndpoint('GET sm:/sites/abc-123/devices'), 'GET sm:/sites/:id/devices');
    assert.equal(normalizeUpstreamEndpoint('GET /connection/?x=1'), 'GET /connection/');
});

test('counts calls, cache hits and shared answers per source and endpoint', () => {
    recordUpstream('unifi', 'GET /api/s/default/stat/device', 'call');
    recordUpstream('unifi', 'GET /api/s/other/stat/device', 'call');
    recordUpstream('unifi', 'GET /api/s/default/stat/device', 'cache');
    recordUpstream('unifi', 'GET /api/s/default/stat/device', 'shared');
    recordUpstream('freebox', 'GET /system/', 'call');

    const stats = getUpstreamStats();
    const unifi = stats.sources.find((s) => s.source === 'unifi');
    const freebox = stats.sources.find((s) => s.source === 'freebox');
    assert.deepEqual(unifi?.total, { call: 2, cache: 1, shared: 1 });
    assert.equal(unifi?.endpoints.length, 1);
    assert.equal(unifi?.endpoints[0].endpoint, 'GET /api/s/:site/stat/device');
    assert.deepEqual(freebox?.total, { call: 1, cache: 0, shared: 0 });
});

test('reset clears every counter', () => {
    recordUpstream('freebox', 'GET /system/', 'call');
    resetUpstreamStats();
    const stats = getUpstreamStats();
    assert.ok(stats.sources.every((s) => s.endpoints.length === 0 && s.total.call === 0));
});
