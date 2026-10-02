import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handValue, isBlackjack, type Card, type Rank } from './blackjack.ts';

const hand = (...ranks: Rank[]): Card[] => ranks.map((rank) => ({ rank, suit: '♠' }));

test('handValue demotes aces from 11 to 1, one at a time, until the hand fits', () => {
  assert.equal(handValue(hand('A', 'A', '9')).total, 21);
  assert.equal(handValue(hand('A', 'A', 'A', '8')).total, 21);
  assert.equal(handValue(hand('A', 'K')).total, 21);
  assert.equal(handValue(hand('A', 'A')).total, 12);
  assert.equal(handValue(hand('A', 'K', 'Q')).total, 21);
});

test('handValue counts face cards as 10 and reports soft hands', () => {
  assert.deepEqual(handValue(hand('K', 'Q')), { total: 20, soft: false });
  assert.equal(handValue(hand('A', '6')).soft, true);
  assert.equal(handValue(hand('A', '6', 'K')).soft, false);
});

test('isBlackjack is a two-card 21 only', () => {
  assert.equal(isBlackjack(hand('A', 'K')), true);
  assert.equal(isBlackjack(hand('A', '10')), true);
  assert.equal(isBlackjack(hand('7', '7', '7')), false);
  assert.equal(isBlackjack(hand('A', '9', 'A')), false);
});
