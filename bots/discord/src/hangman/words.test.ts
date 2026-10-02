import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WORDS } from './words.ts';

test('every hangman word is guessable: lowercase a-z only (brief 16)', () => {
  const all = Object.values(WORDS).flat();
  assert.ok(all.length > 50, 'expected the word lists to load');
  const unwinnable = all.filter((w) => !/^[a-z]+$/.test(w));
  assert.deepEqual(unwinnable, []);
});
