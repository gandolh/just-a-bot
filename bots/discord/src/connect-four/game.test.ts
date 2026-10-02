import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COLS, ROWS, dropDisc, newC4Game } from './game.ts';

/** Play columns in order, alternating R/Y from R. */
function play(cols: number[]) {
  const game = newC4Game();
  for (const c of cols) assert.equal(dropDisc(game, c), true, `drop in ${c}`);
  return game;
}

test('horizontal four wins', () => {
  // R: 0 1 2 3 on the bottom row; Y stacks on top of R's first three.
  const g = play([0, 0, 1, 1, 2, 2, 3]);
  assert.equal(g.winner, 'R');
  assert.equal(g.finished, true);
  assert.equal(g.winningCells?.length, 4);
});

test('vertical four wins', () => {
  const g = play([0, 1, 0, 1, 0, 1, 0]);
  assert.equal(g.winner, 'R');
});

test('diagonal up-right four wins', () => {
  // R ends on (row 2, col 3) with a staircase 0..3.
  const g = play([0, 1, 1, 2, 2, 3, 2, 3, 3, 6, 3]);
  assert.equal(g.winner, 'R');
});

test('diagonal up-left four wins', () => {
  const g = play([6, 5, 5, 4, 4, 3, 4, 3, 3, 0, 3]);
  assert.equal(g.winner, 'R');
});

test('three in a row with a gap is not a win', () => {
  // R: 0 1 3 on the bottom row (gap at 2).
  const g = play([0, 0, 1, 1, 3]);
  assert.equal(g.winner, null);
  assert.equal(g.finished, false);
});

test('a full board with no four is a draw', () => {
  // Columns filled in pairs so no line of four forms: per column the pattern
  // alternates in blocks, a standard no-win fill.
  const game = newC4Game();
  const order = [0, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 2, 3, 2, 3, 2, 3, 3, 2, 3, 2, 3, 2, 4, 5, 4, 5, 4, 5, 5, 4, 5, 4, 5, 4, 6, 6, 6, 6, 6, 6];
  for (const c of order) dropDisc(game, c);
  const filled = game.board.flat().filter((cell) => cell !== null).length;
  assert.equal(filled, ROWS * COLS);
  assert.equal(game.winner, 'draw');
  assert.equal(game.finished, true);
});

test('a full column and a finished game refuse more discs', () => {
  const game = newC4Game();
  for (let i = 0; i < ROWS; i++) dropDisc(game, 6);
  assert.equal(dropDisc(game, 6), false);
  const won = play([0, 1, 0, 1, 0, 1, 0]);
  assert.equal(dropDisc(won, 2), false);
});
