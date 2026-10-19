// Per-token rate limiting (REST API tokens + MCP tokens): fixed window
// counter, heavy-route detection, and the 429 returned by requireAuth.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Must be set before the server modules are loaded (read at import time)
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mwk-token-limit-test-'));
process.env.DATABASE_PATH = path.join(tmpDir, 'test.db');
process.env.JWT_SECRET = 'test-secret-not-used-in-production';

const { initializeDatabase } = await import('../database/connection.js');
initializeDatabase();
const { mcpAuthService } = await import('../services/mcpAuthService.js');
const { requireAuth } = await import('../middleware/authMiddleware.js');
const { isHeavyApiTokenRequest } = await import('../middleware/apiTokenAuth.js');
const { FixedWindowLimiter, tokenGeneralLimiter, tokenHeavyLimiter } = await import('../middleware/tokenRateLimiter.js');

let apiToken: string;

before(() => {
    apiToken = mcpAuthService.generateToken('MyServices', null, 'read_only', 'api').token;
});

beforeEach(() => {
    tokenGeneralLimiter.reset();
    tokenHeavyLimiter.reset();
});

after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
});

function fakeReq(url: string, query: Record<string, unknown> = {}) {
    return {
        headers: { authorization: `Bearer ${apiToken}` },
        method: 'GET',
        originalUrl: url,
        query,
        socket: { remoteAddress: '192.168.1.50' }
    } as any;
}

function fakeRes() {
    return {
        statusCode: 200,
        body: undefined as any,
        headers: {} as Record<string, string>,
        status(code: number) { this.statusCode = code; return this; },
        json(body: unknown) { this.body = body; return this; },
        setHeader(name: string, value: string) { this.headers[name] = value; }
    };
}

async function call(url: string, query?: Record<string, unknown>) {
    const res = fakeRes();
    let nextCalled = false;
    await requireAuth(fakeReq(url, query), res as any, () => { nextCalled = true; });
    return { res, nextCalled };
}

test('fixed window allows max hits then refuses until the window ends', () => {
    const limiter = new FixedWindowLimiter(3, 1000);
    for (let i = 0; i < 3; i++) assert.equal(limiter.hit('a', 0).allowed, true);
    const refused = limiter.hit('a', 400);
    assert.equal(refused.allowed, false);
    assert.equal(refused.retryAfterSeconds, 1);
    assert.equal(limiter.hit('b', 400).allowed, true, 'keys are independent');
    assert.equal(limiter.hit('a', 1000).allowed, true, 'new window');
});

test('heavy routes: ip-details always, top-traffic only in live mode', () => {
    assert.equal(isHeavyApiTokenRequest('/api/search/ip-details/192.168.1.10', {}), true);
    assert.equal(isHeavyApiTokenRequest('/api/plugins/unifi/top-traffic', { mode: 'live' }), true);
    assert.equal(isHeavyApiTokenRequest('/api/plugins/unifi/top-traffic', { mode: 'today' }), false);
    assert.equal(isHeavyApiTokenRequest('/api/plugins/unifi/top-traffic', {}), false);
    assert.equal(isHeavyApiTokenRequest('/api/network-scan/history', {}), false);
});

test('API token gets 429 after 30 heavy calls per minute, light routes still pass', async () => {
    for (let i = 0; i < 30; i++) {
        const { nextCalled } = await call('/api/search/ip-details/192.168.1.10');
        assert.equal(nextCalled, true, `call ${i + 1}`);
    }
    const { res, nextCalled } = await call('/api/search/ip-details/192.168.1.10');
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 429);
    assert.equal(res.body.error.code, 'RATE_LIMITED');
    assert.ok(Number(res.headers['Retry-After']) > 0);

    const light = await call('/api/network-scan/history');
    assert.equal(light.nextCalled, true);
});

test('API token gets 429 after 300 requests per minute', async () => {
    for (let i = 0; i < 300; i++) {
        const { nextCalled } = await call('/api/network-scan/history');
        assert.equal(nextCalled, true, `call ${i + 1}`);
    }
    const { res } = await call('/api/network-scan/history');
    assert.equal(res.statusCode, 429);
});
