import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wicketClient, WicketError, type WicketJob } from './client.ts';

const job: WicketJob = { id: 'j1', ticket: 14, nowServing: 11, position: 3, status: 'queued' };

/** A fetch that records each request and answers from `respond`. */
function fakeFetch(respond: (url: string, init: RequestInit) => Response) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch = (async (url: string | URL | Request, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    return respond(String(url), init);
  }) as typeof globalThis.fetch;
  return { calls, fetch };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

test('submit posts only the messages, with the bearer token, to /v1/jobs', async () => {
  const { calls, fetch } = fakeFetch(() => json(202, job));
  const client = wicketClient({ url: 'https://example.com/wicket-api/', token: 't0k', fetch });
  assert.deepEqual(await client.submit([{ role: 'user', content: 'Hi' }]), job);
  assert.equal(calls[0].url, 'https://example.com/wicket-api/v1/jobs');
  assert.equal(calls[0].init.method, 'POST');
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), { messages: [{ role: 'user', content: 'Hi' }] });
  assert.equal((calls[0].init.headers as Record<string, string>).authorization, 'Bearer t0k');
});

test('get long-polls with ?wait, held to 25, and a 404 means the job is gone', async () => {
  const { calls, fetch } = fakeFetch((url) => (url.endsWith('/gone?wait=25') ? json(404, {}) : json(200, job)));
  const client = wicketClient({ url: 'https://example.com/wicket-api', token: 't', fetch });
  assert.deepEqual(await client.get('j1', 10), job);
  assert.equal(calls[0].url, 'https://example.com/wicket-api/v1/jobs/j1?wait=10');
  assert.equal(await client.get('gone', 90), undefined);
});

test("a full queue and other refusals become WicketErrors a member can read", async () => {
  const full = wicketClient({
    url: 'https://w',
    token: 't',
    fetch: fakeFetch(() => json(503, { code: 'queue_full', message: '200 calls are waiting' })).fetch,
  });
  await assert.rejects(full.submit([{ role: 'user', content: 'x' }]), {
    name: 'Error',
    message: 'The queue is full right now. Try again in a few minutes.',
  });
  const refused = wicketClient({
    url: 'https://w',
    token: 'bad',
    fetch: fakeFetch(() => json(401, { code: 'unauthorized', message: 'unknown token' })).fetch,
  });
  await assert.rejects(refused.get('j1', 0), (err) => err instanceof WicketError && err.message === 'Wicket answered 401: unknown token');
});

test('an unreachable Wicket is a WicketError, and cancel sends DELETE', async () => {
  const down = wicketClient({
    url: 'https://w',
    token: 't',
    fetch: (async () => {
      throw new TypeError('fetch failed');
    }) as typeof globalThis.fetch,
  });
  await assert.rejects(down.submit([]), (err) => err instanceof WicketError && err.message === 'Could not reach Wicket.');

  const { calls, fetch } = fakeFetch(() => json(200, { ...job, status: 'cancelled' }));
  await wicketClient({ url: 'https://w', token: 't', fetch }).cancel('j1');
  assert.equal(calls[0].init.method, 'DELETE');
  assert.equal(calls[0].url, 'https://w/v1/jobs/j1');
});
