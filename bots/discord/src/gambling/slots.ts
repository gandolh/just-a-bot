export const SIZE = 5;
export const REELS = ['🍒', '🍋', '🍊', '🍇', '🔔', '⭐', '💎'] as const;
export type Sym = (typeof REELS)[number];

const BASE_MULT: Record<Sym, number> = {
  '🍒': 2,
  '🍋': 3,
  '🍊': 4,
  '🍇': 5,
  '🔔': 8,
  '⭐': 12,
  '💎': 25,
};

const LENGTH_MULT: Record<3 | 4 | 5, number> = {
  3: 1,
  4: 4,
  5: 15,
};

function buildLines(): { name: string; cells: [number, number][] }[] {
  const lines: { name: string; cells: [number, number][] }[] = [];
  for (let r = 0; r < SIZE; r++) {
    lines.push({
      name: `Row ${r + 1}`,
      cells: Array.from({ length: SIZE }, (_, c) => [r, c] as [number, number]),
    });
  }
  for (let c = 0; c < SIZE; c++) {
    lines.push({
      name: `Col ${c + 1}`,
      cells: Array.from({ length: SIZE }, (_, r) => [r, c] as [number, number]),
    });
  }
  lines.push({
    name: 'Diag ↘',
    cells: Array.from({ length: SIZE }, (_, i) => [i, i] as [number, number]),
  });
  lines.push({
    name: 'Diag ↙',
    cells: Array.from({ length: SIZE }, (_, i) => [i, SIZE - 1 - i] as [number, number]),
  });
  return lines;
}

export const LINES = buildLines();

export type Grid = Sym[][];

export function spin(): Grid {
  const grid: Grid = [];
  for (let r = 0; r < SIZE; r++) {
    const row: Sym[] = [];
    for (let c = 0; c < SIZE; c++) {
      row.push(REELS[Math.floor(Math.random() * REELS.length)]);
    }
    grid.push(row);
  }
  return grid;
}

export interface LineWin {
  name: string;
  symbol: Sym;
  count: 3 | 4 | 5;
  mult: number;
  winnings: number;
}

export function evaluate(grid: Grid, perLine: number): { wins: LineWin[]; total: number } {
  const wins: LineWin[] = [];
  let total = 0;
  for (const line of LINES) {
    const symbols = line.cells.map(([r, c]) => grid[r][c]);
    const first = symbols[0];
    let run = 1;
    for (let i = 1; i < symbols.length; i++) {
      if (symbols[i] === first) run++;
      else break;
    }
    if (run < 3) continue;
    const count = run as 3 | 4 | 5;
    const mult = BASE_MULT[first] * LENGTH_MULT[count];
    const winnings = perLine * mult;
    wins.push({ name: line.name, symbol: first, count, mult, winnings });
    total += winnings;
  }
  return { wins, total };
}

export function renderGrid(grid: Grid): string {
  return grid.map((row) => row.join(' ')).join('\n');
}
