// Read-only REST API tokens: auth matrix for requireAuth / requireAdmin /
// mcpAuthMiddleware. Runs against a throwaway SQLite file (npm test).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Must be set before the server modules are loaded (read at import time)
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mwk-api-token-test-'));
process.env.DATABASE_PATH = path.join(tmpDir, 'test.db');
process.env.JWT_SECRET = 'test-secret-not-used-in-production';

const { initializeDatabase } = await import('../database/connection.js');
initializeDatabase();
const { mcpAuthService } = await import('../services/mcpAuthService.js');
const { authService } = await import('../services/authService.js');
const { requireAuth, requireAdmin } = await import('../middleware/authMiddleware.js');
const { mcpAuthMiddleware } = await import('../middleware/mcpAuthMiddleware.js');
const { stripSensitiveFields, isApiTokenRouteAllowed } = await import('../middleware/apiTokenAuth.js');

const LAN_IP = '192.168.1.50';
const SENSITIVE = /key|pass|secret|token|auth/i;

interface FakeRes {
    statusCode: number;
    body: unknown;
    status(code: number): FakeRes;
    json(body: unknown): FakeRes;
}

function fakeReq(token: string, method = 'GET', url = '/api/network-scan/history', ip = LAN_IP) {
    return {
        headers: { authorization: `Bearer ${token}` },
        method,
        originalUrl: url,
        socket: { remoteAddress: ip }
    } as any;
}

function fakeRes(): FakeRes {
    return {
        statusCode: 200,
        body: undefined,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; }
    };
}

async function runAuth(req: any) {
    const res = fakeRes();
    let nextCalled = false;
    await requireAuth(req, res as any, () => { nextCalled = true; });
    return { res, nextCalled };
}

let apiToken: string;
let mcpToken: string;

before(() => {
    apiToken = mcpAuthService.generateToken('MyServices', null, 'read_only', 'api').token;
    mcpToken = mcpAuthService.generateToken('Claude', null, 'full', 'mcp').token;
});

after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('valid API token on an allowlisted GET route passes and is identified', async () => {
    const req = fakeReq(apiToken);
    const { res, nextCalled } = await runAuth(req);
    assert.equal(nextCalled, true, `expected next(), got ${res.statusCode} ${JSON.stringify(res.body)}`);
    assert.equal(req.apiToken.name, 'MyServices');
    assert.equal(req.user.username, 'api:MyServices');
    assert.equal(req.user.role, 'viewer');
});

test('HEAD is accepted like GET', async () => {
    const { nextCalled } = await runAuth(fakeReq(apiToken, 'HEAD'));
    assert.equal(nextCalled, true);
});

for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    test(`${method} with an API token is refused with 403`, async () => {
        const { res, nextCalled } = await runAuth(fakeReq(apiToken, method));
        assert.equal(nextCalled, false);
        assert.equal(res.statusCode, 403);
    });
}

test('route outside the allowlist is refused with 403 (not 404)', async () => {
    for (const url of ['/api/network-scan/config', '/api/plugins/unifi/token', '/api/users', '/api/wifi/bss']) {
        const { res, nextCalled } = await runAuth(fakeReq(apiToken, 'GET', url));
        assert.equal(nextCalled, false, url);
        assert.equal(res.statusCode, 403, url);
    }
});

test('client outside LAN/Tailscale is refused with 403', async () => {
    const { res, nextCalled } = await runAuth(fakeReq(apiToken, 'GET', '/api/network-scan/history', '8.8.8.8'));
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);
});

test('expired API token is refused with 401', async () => {
    const { token } = mcpAuthService.generateToken('Old', new Date(Date.now() - 60_000), 'read_only', 'api');
    const { res, nextCalled } = await runAuth(fakeReq(token));
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 401);
});

test('revoked API token is refused with 401', async () => {
    const { token, summary } = mcpAuthService.generateToken('Revoked', null, 'read_only', 'api');
    assert.equal(mcpAuthService.revokeToken(summary.id, 'api'), true);
    const { res, nextCalled } = await runAuth(fakeReq(token));
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 401);
});

test('unknown token with the API prefix is refused with 401', async () => {
    const { res } = await runAuth(fakeReq('mwk_api_' + '0'.repeat(64)));
    assert.equal(res.statusCode, 401);
});

test('requireAdmin always refuses an API token', async () => {
    const req = fakeReq(apiToken);
    await runAuth(req);
    const res = fakeRes();
    let nextCalled = false;
    requireAdmin(req, res as any, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);
});

test('MCP token is refused on the REST API with 401', async () => {
    const { res, nextCalled } = await runAuth(fakeReq(mcpToken));
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 401);
});

test('API token is refused on /api/mcp with 401, MCP token still accepted', async () => {
    const run = (token: string) => {
        const res = fakeRes();
        let nextCalled = false;
        mcpAuthMiddleware(fakeReq(token, 'POST', '/api/mcp'), res as any, () => { nextCalled = true; });
        return { res, nextCalled };
    };
    const api = run(apiToken);
    assert.equal(api.nextCalled, false);
    assert.equal(api.res.statusCode, 401);
    assert.equal(run(mcpToken).nextCalled, true);
});

test('web JWT login is unchanged', async () => {
    await authService.register({ username: 'alice', email: 'alice@example.test', password: 'password123', role: 'admin' });
    const { token } = await authService.login('alice', 'password123');
    const req = fakeReq(token, 'POST', '/api/users');
    const { nextCalled } = await runAuth(req);
    assert.equal(nextCalled, true);
    assert.equal(req.user.username, 'alice');
    assert.equal(req.user.role, 'admin');
    assert.equal(req.apiToken, undefined);
});

test('API token responses never contain credential-like fields', async () => {
    const req = fakeReq(apiToken);
    const { res } = await runAuth(req);
    res.json({
        success: true,
        result: [{
            mac: 'aa:bb:cc:dd:ee:ff',
            config: { ssid: 'Home', key: 'wpa-secret', wpa_psk: 'x' },
            x_authkey: 'k',
            nested: [{ password: 'p', apiKey: 'a', session_token: 't', hostname: 'nas' }]
        }]
    });
    const serialized = JSON.stringify(res.body);
    const leakedKeys = [...serialized.matchAll(/"([^"]+)":/g)].map((m) => m[1]).filter((k) => SENSITIVE.test(k));
    assert.deepEqual(leakedKeys, []);
    assert.match(serialized, /"hostname":"nas"/);
    assert.match(serialized, /"ssid":"Home"/);
});

test('stripSensitiveFields keeps non-sensitive data intact', () => {
    assert.deepEqual(stripSensitiveFields({ a: 1, list: [{ ip: '10.0.0.1', password: 'x' }] }), { a: 1, list: [{ ip: '10.0.0.1' }] });
});

test('allowlist matches only the documented routes', () => {
    for (const p of ['/api/network-scan/history', '/api/network-scan/192.168.1.10', '/api/lan/devices', '/api/dhcp/leases',
        '/api/wifi/stations', '/api/topology', '/api/topology/', '/api/plugins/unifi/clients', '/api/plugins/unifi/devices']) {
        assert.equal(isApiTokenRouteAllowed(p), true, p);
    }
    for (const p of ['/api/network-scan/blacklist', '/api/topology/positions', '/api/dhcp/config', '/api/lan/config',
        '/api/plugins/unifi/nat', '/api/settings/dhcp/leases', '/api/network-scan/1.2.3.4/rescan']) {
        assert.equal(isApiTokenRouteAllowed(p), false, p);
    }
});
