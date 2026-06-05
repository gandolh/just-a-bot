import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from 'discord.js';
import { evaluate, LINES, renderGrid, SIZE, spin } from '../gambling/slots.ts';
import { credit, getBalance, tryDebit } from '../gambling/wallet.ts';
import type { Command } from './types.ts';

function respinButton(bet: number): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`slots:respin:${bet}`)
        .setLabel(`Spin again (${bet.toLocaleString()})`)
        .setStyle(ButtonStyle.Danger),
    ),
  ];
}

async function playSpin(bet: number): Promise<{ lines: string[]; payout: number }> {
  const perLine = bet / LINES.length;
  const grid = spin();
  const { wins, total } = evaluate(grid, perLine);
  const totalRounded = Math.floor(total);

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

  return { lines, payout: totalRounded };
}

export async function handleSlotsButton(interaction: ButtonInteraction): Promise<void> {
  const parts = interaction.customId.split(':');
  if (parts[1] !== 'respin') return;

  const bet = Number(parts[2]);
  if (!Number.isFinite(bet) || bet < 1) {
    await interaction.reply({ content: 'Invalid bet.', ephemeral: true });
    return;
  }

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

  const { lines, payout } = await playSpin(bet);
  if (payout > 0) await credit(userId, payout);

  const balance = await getBalance(userId);
  const net = payout - bet;
  const sign = net >= 0 ? '+' : '';
  lines.push(`Net: **${sign}${net.toLocaleString()}** • Balance: **${balance.toLocaleString()}**`);

  await interaction.reply({ content: lines.join('\n'), components: respinButton(bet) });
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
  async execute(interaction: ChatInputCommandInteraction) {
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

    const { lines, payout } = await playSpin(bet);
    if (payout > 0) await credit(userId, payout);

    const balance = await getBalance(userId);
    const net = payout - bet;
    const sign = net >= 0 ? '+' : '';
    lines.push(`Net: **${sign}${net.toLocaleString()}** • Balance: **${balance.toLocaleString()}**`);

    await interaction.reply({ content: lines.join('\n'), components: respinButton(bet) });
  },
};
