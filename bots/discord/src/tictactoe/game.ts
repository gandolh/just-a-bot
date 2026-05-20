export type Mark = 'X' | 'O';
export type Cell = Mark | null;
export type Board = Cell[];

export interface Game {
  board: Board;
  turn: Mark;
  winner: Mark | 'draw' | null;
  finished: boolean;
  winningLine: number[] | null;
}

const LINES: ReadonlyArray<readonly [number, number, number]> = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

export function newBoard(): Board {
  return Array<Cell>(9).fill(null);
}

export function newGame(): Game {
  return { board: newBoard(), turn: 'X', winner: null, finished: false, winningLine: null };
}

export function checkWinner(board: Board): { winner: Mark; line: number[] } | null {
  for (const line of LINES) {
    const [a, b, c] = line;
    const v = board[a];
    if (v && v === board[b] && v === board[c]) return { winner: v, line: [...line] };
  }
  return null;
}

export function applyMove(game: Game, cell: number, mark: Mark): boolean {
  if (game.finished) return false;
  if (game.turn !== mark) return false;
  if (cell < 0 || cell > 8) return false;
  if (game.board[cell]) return false;

  game.board[cell] = mark;
  const win = checkWinner(game.board);
  if (win) {
    game.winner = win.winner;
    game.winningLine = win.line;
    game.finished = true;
  } else if (game.board.every((c) => c !== null)) {
    game.winner = 'draw';
    game.finished = true;
  } else {
    game.turn = mark === 'X' ? 'O' : 'X';
  }
  return true;
}

function terminalScore(board: Board, ai: Mark, depth: number): number | null {
  const win = checkWinner(board);
  if (win) return win.winner === ai ? 10 - depth : depth - 10;
  if (board.every((c) => c !== null)) return 0;
  return null;
}

function minimax(board: Board, ai: Mark, current: Mark, depth: number): number {
  const terminal = terminalScore(board, ai, depth);
  if (terminal !== null) return terminal;

  const next: Mark = current === 'X' ? 'O' : 'X';
  let best = current === ai ? -Infinity : Infinity;
  for (let i = 0; i < 9; i++) {
    if (board[i]) continue;
    board[i] = current;
    const score = minimax(board, ai, next, depth + 1);
    board[i] = null;
    if (current === ai) {
      if (score > best) best = score;
    } else {
      if (score < best) best = score;
    }
  }
  return best;
}

export function botMove(board: Board, mark: Mark): number {
  const opp: Mark = mark === 'X' ? 'O' : 'X';
  const scored: { move: number; score: number }[] = [];
  for (let i = 0; i < 9; i++) {
    if (board[i]) continue;
    board[i] = mark;
    const score = minimax(board, mark, opp, 1);
    board[i] = null;
    scored.push({ move: i, score });
  }
  const best = Math.max(...scored.map((s) => s.score));
  const ties = scored.filter((s) => s.score === best);
  return ties[Math.floor(Math.random() * ties.length)].move;
}
