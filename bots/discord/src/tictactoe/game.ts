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

function findCompleting(board: Board, mark: Mark): number {
  for (const line of LINES) {
    const cells = line.map((i) => board[i]);
    const own = cells.filter((c) => c === mark).length;
    const empty = cells.filter((c) => c === null).length;
    if (own === 2 && empty === 1) return line[cells.indexOf(null)];
  }
  return -1;
}

export function botMove(board: Board, mark: Mark): number {
  const opp: Mark = mark === 'X' ? 'O' : 'X';
  const win = findCompleting(board, mark);
  if (win !== -1) return win;
  const block = findCompleting(board, opp);
  if (block !== -1) return block;
  if (!board[4]) return 4;
  const corners = [0, 2, 6, 8].filter((i) => !board[i]);
  if (corners.length) return corners[Math.floor(Math.random() * corners.length)];
  const edges = [1, 3, 5, 7].filter((i) => !board[i]);
  return edges[Math.floor(Math.random() * edges.length)];
}
