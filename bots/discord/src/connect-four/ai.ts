import { type C4Game, type Cell, type Disc, COLS, ROWS, dropDisc, isColumnPlayable, newC4Game } from './game.ts';

const MAX_DEPTH = 6; // plies of lookahead
const WIN_SCORE = 1_000_000;

/** Deep-clone a game so the AI can explore moves without mutating the live one. */
function cloneGame(game: C4Game): C4Game {
  const copy = newC4Game();
  copy.board = game.board.map((row) => [...row]);
  copy.turn = game.turn;
  copy.winner = game.winner;
  copy.finished = game.finished;
  copy.winningCells = game.winningCells ? game.winningCells.map((c) => [...c] as [number, number]) : null;
  return copy;
}

/** Count windows of 4 and score them for `me` (higher = better for `me`). */
function evaluate(board: Cell[][], me: Disc): number {
  const opp: Disc = me === 'R' ? 'Y' : 'R';
  let score = 0;

  // Center column preference — central control wins more games.
  const center = Math.floor(COLS / 2);
  for (let r = 0; r < ROWS; r++) {
    if (board[r][center] === me) score += 3;
  }

  const scoreWindow = (cells: Cell[]) => {
    const mine = cells.filter((c) => c === me).length;
    const theirs = cells.filter((c) => c === opp).length;
    const empty = cells.filter((c) => c === null).length;
    if (mine > 0 && theirs > 0) return; // contested, no value
    if (mine === 3 && empty === 1) score += 50;
    else if (mine === 2 && empty === 2) score += 10;
    else if (theirs === 3 && empty === 1) score -= 80; // block threats aggressively
    else if (theirs === 2 && empty === 2) score -= 8;
  };

  const directions: Array<[number, number]> = [[0, 1], [1, 0], [1, 1], [1, -1]];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      for (const [dr, dc] of directions) {
        const er = r + dr * 3;
        const ec = c + dc * 3;
        if (er < 0 || er >= ROWS || ec < 0 || ec >= COLS) continue;
        const cells: Cell[] = [];
        for (let k = 0; k < 4; k++) cells.push(board[r + dr * k][c + dc * k]);
        scoreWindow(cells);
      }
    }
  }
  return score;
}

/** Columns ordered center-out — improves alpha-beta pruning. */
function orderedColumns(game: C4Game): number[] {
  const center = Math.floor(COLS / 2);
  const cols: number[] = [];
  for (let offset = 0; offset < COLS; offset++) {
    for (const c of offset === 0 ? [center] : [center - offset, center + offset]) {
      if (c >= 0 && c < COLS && isColumnPlayable(game, c)) cols.push(c);
    }
  }
  return cols;
}

function minimax(
  game: C4Game,
  depth: number,
  alpha: number,
  beta: number,
  maximizing: boolean,
  me: Disc,
): number {
  if (game.finished) {
    if (game.winner === me) return WIN_SCORE - (MAX_DEPTH - depth); // prefer faster wins
    if (game.winner === 'draw' || game.winner === null) return 0;
    return -WIN_SCORE + (MAX_DEPTH - depth); // prefer slower losses
  }
  if (depth === 0) return evaluate(game.board, me);

  const cols = orderedColumns(game);
  if (maximizing) {
    let best = -Infinity;
    for (const c of cols) {
      const next = cloneGame(game);
      dropDisc(next, c);
      best = Math.max(best, minimax(next, depth - 1, alpha, beta, false, me));
      alpha = Math.max(alpha, best);
      if (alpha >= beta) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const c of cols) {
      const next = cloneGame(game);
      dropDisc(next, c);
      best = Math.min(best, minimax(next, depth - 1, alpha, beta, true, me));
      beta = Math.min(beta, best);
      if (alpha >= beta) break;
    }
    return best;
  }
}

/**
 * Pick the best column for the side whose turn it currently is.
 * Returns a playable column index, or -1 if the board is full.
 */
export function chooseMove(game: C4Game): number {
  const me = game.turn;
  const cols = orderedColumns(game);
  if (cols.length === 0) return -1;

  let bestCol = cols[0];
  let bestScore = -Infinity;
  for (const c of cols) {
    const next = cloneGame(game);
    dropDisc(next, c);
    const score = minimax(next, MAX_DEPTH - 1, -Infinity, Infinity, false, me);
    if (score > bestScore) {
      bestScore = score;
      bestCol = c;
    }
  }
  return bestCol;
}
