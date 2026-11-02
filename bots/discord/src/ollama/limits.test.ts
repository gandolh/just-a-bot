import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AskLimiter, allowedModels, ASK_COOLDOWN_MS, pickModel } from './limits.ts';

test('the offered models are the default and OLLAMA_MODELS, cleaned', () => {
  assert.deepEqual(allowedModels('gpt-oss:120b', undefined), ['gpt-oss:120b']);
  assert.deepEqual(allowedModels('gpt-oss:120b', ' qwen3:32b, ,gpt-oss:120b,llama3 '), ['gpt-oss:120b', 'qwen3:32b', 'llama3']);
  assert.equal(allowedModels('a', 'x'.repeat(101)).length, 1, 'a name Discord would refuse is dropped');
  const many = Array.from({ length: 40 }, (_, i) => `m${i}`).join(',');
  assert.equal(allowedModels('a', many).length, 25);
});

test('an unknown model is refused; no pick means the default', () => {
  const offered = ['gpt-oss:120b', 'qwen3:32b'];
  assert.equal(pickModel('some-expensive-model', offered, 'gpt-oss:120b'), null);
  assert.equal(pickModel('qwen3:32b', offered, 'gpt-oss:120b'), 'qwen3:32b');
  assert.equal(pickModel(null, offered, 'gpt-oss:120b'), 'gpt-oss:120b');
});

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
