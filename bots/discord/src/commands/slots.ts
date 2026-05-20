import { SlashCommandBuilder } from 'discord.js';
import { evaluate, LINES, renderGrid, SIZE, spin } from '../gambling/slots.ts';
import { credit, getBalance, tryDebit } from '../gambling/wallet.ts';
import type { Command } from './types.ts';

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
