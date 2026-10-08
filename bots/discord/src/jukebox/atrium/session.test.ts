import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { JukeboxSignInFailed, JukeboxUnavailable } from './errors.ts';
import { parseSessionCookies, planSignIn, REFRESH_LEAD_MS, RELOGIN_WITHIN_MS, toEpochMs, WardSession } from './session.ts';

test('parses both session cookies out of Set-Cookie headers', () => {
  const found = parseSessionCookies([
    'ward_session=eyJhbGci.payload.sig; Path=/; HttpOnly; SameSite=Lax; Max-Age=900',
    'ward_refresh=c6ff19abc; Path=/ward-api/refresh; HttpOnly; SameSite=Lax; Max-Age=2592000',
    'unrelated=1; Path=/',
  ]);
  assert.deepEqual(found, { accessToken: 'eyJhbGci.payload.sig', refreshToken: 'c6ff19abc' });
});

test('a cleared cookie (empty value) is not a token', () => {
  assert.deepEqual(parseSessionCookies(['ward_session=; Path=/; Max-Age=0']), {});
});

test("reads Ward's two expiry formats", () => {
  assert.equal(toEpochMs(1791495524), 1791495524_000);
  assert.equal(toEpochMs('2026-11-07T21:23:44.011Z'), Date.parse('2026-11-07T21:23:44.011Z'));
  assert.equal(toEpochMs('soon'), null);
});

test('the refresh schedule: use, refresh two minutes early, log in with under a day left', () => {
  const now = 1_000_000_000_000;
  const day = 24 * 60 * 60_000;
  const access = (ms: number) => ({ token: 'a', expiresAtMs: now + ms });
  const refresh = (ms: number) => ({ token: 'r', expiresAtMs: now + ms });
  assert.equal(planSignIn(now, { access: access(10 * 60_000), refresh: refresh(20 * day) }), 'use');
  assert.equal(planSignIn(now, { access: access(REFRESH_LEAD_MS - 1), refresh: refresh(20 * day) }), 'refresh');
  assert.equal(planSignIn(now, { access: null, refresh: refresh(20 * day) }), 'refresh');
  assert.equal(planSignIn(now, { access: null, refresh: refresh(RELOGIN_WITHIN_MS - 1) }), 'login');
  assert.equal(planSignIn(now, { access: null, refresh: null }), 'login');
});

/** A local stand-in for Ward's /login and /refresh, counting what it is asked. */
async function fakeWard(handle: (req: IncomingMessage, res: ServerResponse, body: string) => void) {
  const calls: string[] = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      calls.push(`${req.method} ${req.url}${req.headers.origin ? ' origin' : ''}`);
      handle(req, res, body);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}`, calls, close: () => new Promise((r) => server.close(r)) };
}

function signedIn(res: ServerResponse, n: number) {
  res.setHeader('set-cookie', [
    `ward_session=access-${n}; Path=/; HttpOnly; Max-Age=900`,
    `ward_refresh=refresh-${n}; Path=/ward-api/refresh; HttpOnly; Max-Age=2592000`,
  ]);
  res.setHeader('content-type', 'application/json');
  res.end(
    JSON.stringify({
      accessTokenExpiresAt: Math.floor(Date.now() / 1000) + 900,
      refreshTokenExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60_000).toISOString(),
    }),
  );
}

function scratch() {
  const dir = mkdtempSync(join(tmpdir(), 'jukebox-session-'));
  return { file: join(dir, 'jukebox-session.json'), cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test('a wrong password is tried exactly once, and never again until a restart', async () => {
  const ward = await fakeWard((_req, res) => {
    res.statusCode = 401;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'invalid_credentials' }));
  });
  const store = scratch();
  try {
    const session = new WardSession({ wardUrl: ward.url, username: 'discord-bot', password: 'wrong', storeFile: store.file });
    await assert.rejects(session.accessToken(), JukeboxSignInFailed);
    await assert.rejects(session.accessToken(), JukeboxSignInFailed);
    await assert.rejects(session.forceRefresh(), JukeboxSignInFailed);
    assert.deepEqual(ward.calls, ['POST /login']);
    assert.equal(session.signInFailed, true);
  } finally {
    await ward.close();
    store.cleanup();
  }
});

test('signs in once for concurrent callers, saves the refresh token, and the next run resumes with it', async () => {
  let n = 0;
  const ward = await fakeWard((req, res, body) => {
    n += 1;
    if (req.url === '/refresh') assert.equal(JSON.parse(body).refreshToken, 'refresh-1');
    signedIn(res, n);
  });
  const store = scratch();
  try {
    const first = new WardSession({ wardUrl: ward.url, username: 'discord-bot', password: 'pw', storeFile: store.file });
    const tokens = await Promise.all([first.accessToken(), first.accessToken(), first.accessToken()]);
    assert.deepEqual(tokens, ['access-1', 'access-1', 'access-1']);
    const saved = JSON.parse(readFileSync(store.file, 'utf8'));
    assert.equal(saved.username, 'discord-bot');
    assert.equal(saved.refreshToken, 'refresh-1');

    const second = new WardSession({ wardUrl: ward.url, username: 'discord-bot', password: 'pw', storeFile: store.file });
    assert.equal(await second.accessToken(), 'access-2');
    assert.equal(second.lastSignIn, 'refresh');
    assert.deepEqual(ward.calls, ['POST /login', 'POST /refresh'], 'no Origin header, and no second login');
    assert.equal(JSON.parse(readFileSync(store.file, 'utf8')).refreshToken, 'refresh-2');
  } finally {
    await ward.close();
    store.cleanup();
  }
});

test("a saved token for another username is ignored, and a refused refresh falls back to a login", async () => {
  let n = 0;
  const ward = await fakeWard((req, res) => {
    n += 1;
    if (req.url === '/refresh') {
      res.statusCode = 401;
      res.end(JSON.stringify({ error: 'invalid_refresh' }));
      return;
    }
    signedIn(res, n);
  });
  const store = scratch();
  try {
    const a = new WardSession({ wardUrl: ward.url, username: 'old-bot', password: 'pw', storeFile: store.file });
    await a.accessToken();
    const b = new WardSession({ wardUrl: ward.url, username: 'discord-bot', password: 'pw', storeFile: store.file });
    await b.accessToken();
    assert.equal(b.lastSignIn, 'login');
    const c = new WardSession({ wardUrl: ward.url, username: 'discord-bot', password: 'pw', storeFile: store.file });
    await c.accessToken();
    assert.equal(c.lastSignIn, 'login');
    assert.deepEqual(ward.calls, ['POST /login', 'POST /login', 'POST /refresh', 'POST /login']);
  } finally {
    await ward.close();
    store.cleanup();
  }
});

test('a 429 waits for Retry-After before asking Ward again', async () => {
  let now = 1_000_000_000_000;
  let locked = true;
  const ward = await fakeWard((_req, res) => {
    if (locked) {
      res.statusCode = 429;
      res.setHeader('retry-after', '30');
      res.end(JSON.stringify({ error: 'too_many_attempts' }));
      return;
    }
    signedIn(res, 1);
  });
  const store = scratch();
  try {
    const session = new WardSession({ wardUrl: ward.url, username: 'b', password: 'pw', storeFile: store.file, now: () => now });
    await assert.rejects(session.accessToken(), JukeboxUnavailable);
    await assert.rejects(session.accessToken(), JukeboxUnavailable);
    assert.equal(ward.calls.length, 1, 'no request inside the Retry-After window');
    locked = false;
    now += 30_000;
    assert.equal(await session.accessToken(), 'access-1');
    assert.equal(ward.calls.length, 2);
  } finally {
    await ward.close();
    store.cleanup();
  }
});

test('an unreachable Ward backs off from 2 seconds', async () => {
  let now = 1_000_000_000_000;
  const store = scratch();
  try {
    const session = new WardSession({
      wardUrl: 'http://127.0.0.1:9',
      username: 'b',
      password: 'pw',
      storeFile: store.file,
      now: () => now,
    });
    await assert.rejects(session.accessToken(), /trying again in 2 s/);
    await assert.rejects(session.accessToken(), /waiting 2 s/);
    now += 2_000;
    await assert.rejects(session.accessToken(), /trying again in 4 s/);
  } finally {
    store.cleanup();
  }
});
