export type Disc = 'R' | 'Y';
export type Cell = Disc | null;

export const COLS = 7;
export const ROWS = 6;

export interface C4Game {
  board: Cell[][];
  turn: Disc;
  winner: Disc | 'draw' | null;
  finished: boolean;
  winningCells: Array<[number, number]> | null;
}

export function newC4Game(): C4Game {
  return {
    board: Array.from({ length: ROWS }, () => Array<Cell>(COLS).fill(null)),
    turn: 'R',
    winner: null,
    finished: false,
    winningCells: null,
  };
}

function checkWinner(board: Cell[][]): { winner: Disc; cells: Array<[number, number]> } | null {
  const directions: Array<[number, number]> = [
    [0, 1],   // horizontal
    [1, 0],   // vertical
    [1, 1],   // diagonal down-right
    [1, -1],  // diagonal down-left
  ];

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const v = board[r][c];
      if (!v) continue;
      for (const [dr, dc] of directions) {
        const cells: Array<[number, number]> = [[r, c]];
        for (let k = 1; k < 4; k++) {
          const nr = r + dr * k;
          const nc = c + dc * k;
          if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) break;
          if (board[nr][nc] !== v) break;
          cells.push([nr, nc]);
        }
        if (cells.length === 4) return { winner: v, cells };
      }
    }
  }
  return null;
}

/** Drops a disc into the given column. Returns false if the column is full or game is over. */
export function dropDisc(game: C4Game, col: number): boolean {
  if (game.finished) return false;
  if (col < 0 || col >= COLS) return false;

  let row = -1;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (game.board[r][col] === null) {
      row = r;
      break;
    }
  }
  if (row === -1) return false;

  game.board[row][col] = game.turn;

  const win = checkWinner(game.board);
  if (win) {
    game.winner = win.winner;
    game.winningCells = win.cells;
    game.finished = true;
  } else if (game.board[0].every((cell) => cell !== null)) {
    game.winner = 'draw';
    game.finished = true;
  } else {
    game.turn = game.turn === 'R' ? 'Y' : 'R';
  }
  return true;
}

/** Returns whether the given column still has room. */
export function isColumnPlayable(game: C4Game, col: number): boolean {
  return game.board[0][col] === null;
}
