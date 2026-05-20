import { SlashCommandBuilder } from 'discord.js';
import { renderPair, resolveDuel, rollPair } from '../gambling/dice.ts';
import { credit, getBalance, tryDebit } from '../gambling/wallet.ts';
import type { Command } from './types.ts';

export const dice: Command = {
  data: new SlashCommandBuilder()
    .setName('dice')
    .setDescription('Roll 2d6 against the bot — biggest dice wins')
    .addIntegerOption((opt) =>
      opt.setName('bet').setDescription('Coins to wager').setRequired(true).setMinValue(1),
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

    const player = rollPair();
    const bot = rollPair();
    const { outcome, delta, label } = resolveDuel(player.total, bot.total, bet);

    if (outcome === 'win') await credit(userId, bet * 2);
    else if (outcome === 'push') await credit(userId, bet);

    const balance = await getBalance(userId);
    const sign = delta >= 0 ? '+' : '';

    await interaction.reply(
      [
        '🎲 **Dice Duel** — 2d6',
        `You:  ${renderPair(player.dice)}  = **${player.total}**`,
        `Bot:  ${renderPair(bot.dice)}  = **${bot.total}**`,
        `${label} Net: **${sign}${delta.toLocaleString()}** • Balance: **${balance.toLocaleString()}**`,
      ].join('\n'),
    );
  },
};
