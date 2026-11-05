import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AskLimiter, ASK_COOLDOWN_MS } from './limits.ts';

test('one question in flight per member, then a cooldown', () => {
  let clock = 0;
  const limiter = new AskLimiter(ASK_COOLDOWN_MS, () => clock);
  const first = limiter.claim('g:dana');
  assert.equal(first.ok, true);
  assert.deepEqual(limiter.claim('g:dana'), { ok: false, reason: 'busy' });
  assert.equal(limiter.claim('g:sam').ok, true, 'other members are not held up');

  if (first.ok) first.done();
  clock = 10_000;
  assert.deepEqual(limiter.claim('g:dana'), { ok: false, reason: 'cooldown', waitSeconds: 20 });
  clock = ASK_COOLDOWN_MS;
  assert.equal(limiter.claim('g:dana').ok, true);
});
