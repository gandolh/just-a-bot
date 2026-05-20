import { SlashCommandBuilder } from 'discord.js';
import { credit, getBalance, tryDebit } from '../wallet.ts';
import type { Command } from './types.ts';

const SIZE = 5;
const REELS = ['🍒', '🍋', '🍊', '🍇', '🔔', '⭐', '💎'] as const;
type Sym = (typeof REELS)[number];

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

const LINES = buildLines();

type Grid = Sym[][];

function spin(): Grid {
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

interface LineWin {
  name: string;
  symbol: Sym;
  count: 3 | 4 | 5;
  mult: number;
  winnings: number;
}

function evaluate(grid: Grid, perLine: number): { wins: LineWin[]; total: number } {
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

function renderGrid(grid: Grid): string {
  return grid.map((row) => row.join(' ')).join('\n');
}

export const slots: Command = {
  data: new SlashCommandBuilder()
    .setName('slots')
    .setDescription(`Spin the ${SIZE}x${SIZE} slot machine (${LINES.length} paylines)`)
    .addIntegerOption((opt) =>
      opt
        .setName('bet')
        .setDescription('Total coins to wager across all lines')
        .setRequired(true)
        .setMinValue(1),
    ),
  async execute(interaction) {
    const bet = interaction.options.getInteger('bet', true);
    const userId = interaction.user.id;

    const ok = await tryDebit(userId, bet);
    if (!ok) {
      const balance = await getBalance(userId);
      await interaction.reply({
        content: `Not enough coins. You have **${balance.toLocaleString()}**, tried to bet **${bet.toLocaleString()}**.`,
        ephemeral: true,
      });
      return;
    }

    const perLine = bet / LINES.length;
    const grid = spin();
    const { wins, total } = evaluate(grid, perLine);
    const totalRounded = Math.floor(total);
    if (totalRounded > 0) await credit(userId, totalRounded);

    const balance = await getBalance(userId);
    const net = totalRounded - bet;
    const sign = net >= 0 ? '+' : '';

    const lines: string[] = [
      `🎰 **Slots** — ${SIZE}×${SIZE}, ${LINES.length} paylines (left/top anchored, 3+ in a row)`,
      renderGrid(grid),
      `Wager: **${bet.toLocaleString()}** (${LINES.length} lines)`,
    ];
    if (wins.length === 0) {
      lines.push('No winning lines.');
    } else {
      lines.push(`**Winning lines (${wins.length}):**`);
      for (const w of wins) {
        lines.push(
          `• ${w.name}: ${w.symbol.repeat(w.count)} (${w.count}×) ×${w.mult} → **${Math.floor(w.winnings).toLocaleString()}**`,
        );
      }
    }
    lines.push(`Net: **${sign}${net.toLocaleString()}** • Balance: **${balance.toLocaleString()}**`);

    await interaction.reply(lines.join('\n'));
  },
};
