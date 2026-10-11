// MCP_TRUSTED_PROXIES: client address resolution for the LAN-only check.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mwk-trusted-proxies-test-'));
process.env.DATABASE_PATH = path.join(tmpDir, 'test.db');
process.env.JWT_SECRET = 'test-secret-not-used-in-production';

const { resolveClientIp } = await import('../middleware/mcpAuthMiddleware.js');
const { parseIpv4Cidrs, isIpInCidrs } = await import('../utils/networkValidation.js');

const proxies = parseIpv4Cidrs('172.18.0.0/16, 10.0.0.5').cidrs;

function req(peer: string, forwarded?: string) {
    return {
        socket: { remoteAddress: peer },
        headers: forwarded === undefined ? {} : { 'x-forwarded-for': forwarded }
    } as any;
}

test('parseIpv4Cidrs accepts IPs and CIDRs, reports invalid entries', () => {
    const { cidrs, invalid } = parseIpv4Cidrs('172.18.0.0/16,10.0.0.5,300.1.1.1,10.0.0.0/33,foo,1.2.3.4/8/9');
    assert.equal(cidrs.length, 2);
    assert.deepEqual(invalid, ['300.1.1.1', '10.0.0.0/33', 'foo', '1.2.3.4/8/9']);
    assert.deepEqual(parseIpv4Cidrs(undefined), { cidrs: [], invalid: [] });
});

test('isIpInCidrs matches ranges, single IPs and IPv4-mapped addresses', () => {
    assert.equal(isIpInCidrs('172.18.5.9', proxies), true);
    assert.equal(isIpInCidrs('::ffff:10.0.0.5', proxies), true);
    assert.equal(isIpInCidrs('10.0.0.6', proxies), false);
    assert.equal(isIpInCidrs('2001:db8::1', proxies), false);
});

test('without trusted proxies the TCP peer is used and X-Forwarded-For ignored', () => {
    assert.equal(resolveClientIp(req('203.0.113.7', '192.168.1.10'), []), '203.0.113.7');
});

test('peer not in the trusted list: X-Forwarded-For ignored (spoofing)', () => {
    assert.equal(resolveClientIp(req('203.0.113.7', '192.168.1.10'), proxies), '203.0.113.7');
});

test('trusted peer: client taken from X-Forwarded-For', () => {
    assert.equal(resolveClientIp(req('172.18.0.2', '203.0.113.7'), proxies), '203.0.113.7');
});

test('client-supplied left entries cannot override the proxy-appended one', () => {
    assert.equal(resolveClientIp(req('172.18.0.2', '192.168.1.10, 203.0.113.7'), proxies), '203.0.113.7');
});

test('chained trusted proxies are skipped from the right', () => {
    assert.equal(resolveClientIp(req('172.18.0.2', '203.0.113.7, 10.0.0.5'), proxies), '203.0.113.7');
});

test('trusted peer with missing, invalid or all-trusted header is refused', () => {
    assert.equal(resolveClientIp(req('172.18.0.2'), proxies), '');
    assert.equal(resolveClientIp(req('172.18.0.2', 'garbage'), proxies), '');
    assert.equal(resolveClientIp(req('172.18.0.2', '10.0.0.5'), proxies), '');
});
