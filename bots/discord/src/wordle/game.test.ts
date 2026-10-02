import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate } from './game.ts';

/** One letter per position: c(orrect), p(resent), a(bsent). */
const marks = (guess: string, target: string) =>
  evaluate(guess, target).letters.map((l) => l.result[0]).join('');

test('two Es against a target with no E: both absent', () => {
  assert.equal(marks('geese', 'chant'), 'aaaaa');
});

test('two Es against a target with one E: exactly one is marked', () => {
  // "lemon" has its one E at index 1, so the guess's second E is correct and
  // every other E is absent: the one copy is used up.
  assert.equal(marks('eerie', 'lemon'), 'acaaa');
  // "tiger" has one E, at index 3: the guess's second E takes it (correct),
  // so the first E is absent rather than present.
  assert.equal(marks('ember', 'tiger'), 'aaacc');
});

test('three Es against a target with two Es: two are marked, the third is absent', () => {
  // "sheep": s h e e p. The E at index 2 is correct, one more E is present,
  // and the last E has no copy left.
  assert.equal(marks('geese', 'sheep'), 'apcpa');
});

test('an exact match is all correct', () => {
  assert.equal(marks('crane', 'crane'), 'ccccc');
});
