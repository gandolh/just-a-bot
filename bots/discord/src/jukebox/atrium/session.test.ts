import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { AtriumClient } from './request.ts';
import { JukeboxSignInFailed, JukeboxUnavailable } from './errors.ts';
import { AtriumSession, clearSpentSessionFile, parseSessionCookie } from './session.ts';

test('parses the session cookie out of Set-Cookie headers', () => {
  assert.equal(
    parseSessionCookie([
      'unrelated=1; Path=/',
      'atrium_session=abc.def-123; Path=/atrium-api; HttpOnly; SameSite=Lax; Max-Age=1209600',
    ]),
    'abc.def-123',
  );
  assert.equal(parseSessionCookie([]), undefined);
});

test('a cleared cookie (empty value) is not a session', () => {
  assert.equal(parseSessionCookie(['atrium_session=; Path=/atrium-api; Max-Age=0']), undefined);
});

/** A local stand-in for atrium: /auth/login, /auth/logout and whatever route a test adds. */
async function fakeAtrium(handle: (req: IncomingMessage, res: ServerResponse, body: string) => void) {
  const calls: string[] = [];
  const cookies: Array<string | undefined> = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      calls.push(`${req.method} ${req.url}${req.headers.origin ? ' origin' : ''}`);
      cookies.push(req.headers.cookie);
      handle(req, res, body);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}`, calls, cookies, close: () => new Promise((r) => server.close(r)) };
}

function json(res: ServerResponse, status: number, body: unknown, headers: Record<string, string | string[]> = {}) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);
  res.end(JSON.stringify(body));
}

const sessionCookie = (value: string) => `atrium_session=${value}; Path=/atrium-api; HttpOnly; SameSite=Lax; Max-Age=1209600`;

const options = (url: string, extra: Partial<ConstructorParameters<typeof AtriumSession>[0]> = {}) => ({
  atriumUrl: url,
  username: 'discord-bot',
  password: 'pw',
  ...extra,
});

test('login posts the credentials with no Origin, keeps the cookie, and is single-flight', async () => {
  let n = 0;
  const atrium = await fakeAtrium((_req, res, body) => {
    n += 1;
    assert.deepEqual(JSON.parse(body), { username: 'discord-bot', password: 'pw' });
    json(res, 200, { user: {}, session: {}, ward: null }, { 'set-cookie': sessionCookie(`s${n}`) });
  });
  try {
    const session = new AtriumSession(options(atrium.url));
    const cookies = await Promise.all([session.cookie(), session.cookie(), session.cookie()]);
    assert.deepEqual(cookies, ['atrium_session=s1', 'atrium_session=s1', 'atrium_session=s1']);
    assert.equal(await session.cookie(), 'atrium_session=s1', 'kept in memory: no second login');
    assert.deepEqual(atrium.calls, ['POST /auth/login'], 'one login, and no Origin header');
    assert.equal(session.logins, 1);
  } finally {
    await atrium.close();
  }
});

test('a wrong password is tried exactly once, and never again until a restart', async () => {
  const atrium = await fakeAtrium((_req, res) => json(res, 401, { error: 'invalid_credentials' }));
  try {
    const session = new AtriumSession(options(atrium.url, { password: 'wrong' }));
    await assert.rejects(session.cookie(), JukeboxSignInFailed);
    await assert.rejects(session.cookie(), JukeboxSignInFailed);
    session.invalidate();
    await assert.rejects(session.cookie(), JukeboxSignInFailed);
    assert.deepEqual(atrium.calls, ['POST /auth/login']);
    assert.equal(session.signInFailed, true);
  } finally {
    await atrium.close();
  }
});

test('a 400 or a cross-site 403 on login also stops for good', async () => {
  for (const [status, error] of [
    [400, 'invalid_request'],
    [403, 'cross_site'],
  ] as const) {
    const atrium = await fakeAtrium((_req, res) => json(res, status, { error }));
    try {
      const session = new AtriumSession(options(atrium.url));
      await assert.rejects(session.cookie(), JukeboxSignInFailed);
      await assert.rejects(session.cookie(), JukeboxSignInFailed);
      assert.equal(atrium.calls.length, 1);
    } finally {
      await atrium.close();
    }
  }
});

test('a 429 waits for retryAfterSeconds before logging in again', async () => {
  let now = 1_000_000_000_000;
  let locked = true;
  const atrium = await fakeAtrium((_req, res) => {
    if (locked) return json(res, 429, { error: 'too_many_attempts', retryAfterSeconds: 30 });
    json(res, 200, {}, { 'set-cookie': sessionCookie('s1') });
  });
  try {
    const session = new AtriumSession(options(atrium.url, { now: () => now }));
    await assert.rejects(session.cookie(), JukeboxUnavailable);
    await assert.rejects(session.cookie(), JukeboxUnavailable);
    assert.equal(atrium.calls.length, 1, 'no request inside the wait');
    assert.equal(session.signInFailed, false, 'a lockout is not a refused password');
    locked = false;
    now += 30_000;
    assert.equal(await session.cookie(), 'atrium_session=s1');
    assert.equal(atrium.calls.length, 2);
  } finally {
    await atrium.close();
  }
});

test('a 200 login with no cookie, and a 5xx, are Unavailable with backoff', async () => {
  let status = 200;
  const atrium = await fakeAtrium((_req, res) => json(res, status, {}));
  let now = 1_000_000_000_000;
  try {
    const session = new AtriumSession(options(atrium.url, { now: () => now }));
    await assert.rejects(session.cookie(), /without an atrium_session cookie; trying again in 2 s/);
    now += 2_000;
    status = 503;
    await assert.rejects(session.cookie(), /login failed with 503; trying again in 4 s/);
    assert.equal(session.signInFailed, false);
  } finally {
    await atrium.close();
  }
});

test('atrium down is JukeboxUnavailable, backing off from 2 seconds', async () => {
  let now = 1_000_000_000_000;
  const session = new AtriumSession(options('http://127.0.0.1:9', { now: () => now }));
  await assert.rejects(session.cookie(), JukeboxUnavailable);
  await assert.rejects(session.cookie(), /waiting 2 s/);
  now += 2_000;
  await assert.rejects(session.cookie(), /trying again in 4 s/);
});

test('the client sends the cookie, and a 401 logs in again once and retries', async () => {
  let logins = 0;
  const atrium = await fakeAtrium((req, res) => {
    if (req.url === '/auth/login') {
      logins += 1;
      return json(res, 200, {}, { 'set-cookie': sessionCookie(`s${logins}`) });
    }
    // The first session has expired at atrium; the second is fine.
    if (req.headers.cookie === 'atrium_session=s1') return json(res, 401, { error: 'unauthorized', reason: 'expired' });
    json(res, 200, { status: 'ok' });
  });
  try {
    const session = new AtriumSession(options(atrium.url));
    const client = new AtriumClient({ atriumUrl: atrium.url }, session);
    assert.deepEqual(await client.json('/health'), { status: 'ok' });
    assert.deepEqual(atrium.calls, ['POST /auth/login', 'GET /health', 'POST /auth/login', 'GET /health']);
    assert.deepEqual(atrium.cookies, [undefined, 'atrium_session=s1', undefined, 'atrium_session=s2']);
    // And it stays on the new session.
    await client.json('/health');
    assert.equal(logins, 2);
  } finally {
    await atrium.close();
  }
});

test('two 401s in a row stop at Unavailable: one re-login per request, not a loop', async () => {
  let logins = 0;
  const atrium = await fakeAtrium((req, res) => {
    if (req.url === '/auth/login') {
      logins += 1;
      return json(res, 200, {}, { 'set-cookie': sessionCookie(`s${logins}`) });
    }
    json(res, 401, { error: 'unauthorized' });
  });
  try {
    const client = new AtriumClient({ atriumUrl: atrium.url }, new AtriumSession(options(atrium.url)));
    await assert.rejects(client.json('/health'), JukeboxUnavailable);
    assert.equal(logins, 2);
  } finally {
    await atrium.close();
  }
});

test('a late 401 for an old cookie does not drop the newer session', async () => {
  let logins = 0;
  const atrium = await fakeAtrium((req, res) => {
    if (req.url === '/auth/login') {
      logins += 1;
      return json(res, 200, {}, { 'set-cookie': sessionCookie(`s${logins}`) });
    }
    if (req.headers.cookie === 'atrium_session=s1') return json(res, 401, { error: 'unauthorized' });
    json(res, 200, { ok: true });
  });
  try {
    const client = new AtriumClient({ atriumUrl: atrium.url }, new AtriumSession(options(atrium.url)));
    await client.json('/a'); // s1 -> 401 -> s2
    const session = client.session;
    session.invalidate('atrium_session=s1'); // a straggler that still holds s1
    assert.equal(await session.cookie(), 'atrium_session=s2');
    assert.equal(logins, 2);
  } finally {
    await atrium.close();
  }
});

test('a renewed Set-Cookie on any response replaces the kept session', async () => {
  const atrium = await fakeAtrium((req, res) => {
    if (req.url === '/auth/login') return json(res, 200, {}, { 'set-cookie': sessionCookie('old') });
    if (req.url === '/renews') return json(res, 200, {}, { 'set-cookie': sessionCookie('renewed') });
    json(res, 200, {});
  });
  try {
    const client = new AtriumClient({ atriumUrl: atrium.url }, new AtriumSession(options(atrium.url)));
    await client.json('/plain');
    await client.json('/renews');
    await client.json('/plain');
    assert.deepEqual(atrium.cookies.slice(1), ['atrium_session=old', 'atrium_session=old', 'atrium_session=renewed']);
    assert.deepEqual(atrium.calls.filter((c) => c.includes('login')).length, 1);
  } finally {
    await atrium.close();
  }
});

test('atrium down under the client is JukeboxUnavailable, not a crash', async () => {
  const client = new AtriumClient({ atriumUrl: 'http://127.0.0.1:9' }, new AtriumSession(options('http://127.0.0.1:9')));
  await assert.rejects(client.json('/health'), JukeboxUnavailable);
});

test('logout posts the cookie and forgets it', async () => {
  const atrium = await fakeAtrium((req, res) => {
    if (req.url === '/auth/login') return json(res, 200, {}, { 'set-cookie': sessionCookie('s1') });
    res.statusCode = 204;
    res.end();
  });
  try {
    const session = new AtriumSession(options(atrium.url));
    await session.cookie();
    await session.logout();
    assert.deepEqual(atrium.calls, ['POST /auth/login', 'POST /auth/logout']);
    assert.equal(atrium.cookies[1], 'atrium_session=s1');
    await session.logout();
    assert.equal(atrium.calls.length, 2, 'nothing to log out of');
  } finally {
    await atrium.close();
  }
});

test('the spent jukebox-session.json is removed, and a missing one is fine', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'jukebox-spent-'));
  try {
    const file = join(dir, 'jukebox-session.json');
    writeFileSync(file, '{"refreshToken":"spent"}');
    await clearSpentSessionFile(file);
    assert.equal(existsSync(file), false);
    await clearSpentSessionFile(file);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
