import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldApplyPlay } from './player.ts';

test('the first play after boot always applies', () => {
  assert.equal(shouldApplyPlay(null, 0), true);
  assert.equal(shouldApplyPlay(null, 57), true);
});

test('after that only a newer playId applies', () => {
  assert.equal(shouldApplyPlay(5, 6), true);
  assert.equal(shouldApplyPlay(5, 5), false, 'the same play delivered twice');
  assert.equal(shouldApplyPlay(6, 5), false, 'a play that lost the race with advance');
});
