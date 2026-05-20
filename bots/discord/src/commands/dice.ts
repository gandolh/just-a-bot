import { SlashCommandBuilder } from 'discord.js';
import { credit, getBalance, tryDebit } from '../wallet.ts';
import type { Command } from './types.ts';

const DIE_FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'] as const;

function rollDie(): number {
  return 1 + Math.floor(Math.random() * 6);
}

function rollPair(): { dice: [number, number]; total: number } {
  const a = rollDie();
  const b = rollDie();
  return { dice: [a, b], total: a + b };
}

function render(dice: [number, number]): string {
  return `${DIE_FACES[dice[0] - 1]} ${DIE_FACES[dice[1] - 1]}`;
}

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

    let outcome: 'win' | 'lose' | 'push';
    let delta: number;
    let label: string;
    if (player.total > bot.total) {
      outcome = 'win';
      delta = bet;
      label = 'You win!';
    } else if (player.total < bot.total) {
      outcome = 'lose';
      delta = -bet;
      label = 'You lose.';
    } else {
      outcome = 'push';
      delta = 0;
      label = 'Push — stake returned.';
    }

    if (outcome === 'win') await credit(userId, bet * 2);
    else if (outcome === 'push') await credit(userId, bet);

    const balance = await getBalance(userId);
    const sign = delta >= 0 ? '+' : '';

    await interaction.reply(
      [
        '🎲 **Dice Duel** — 2d6',
        `You:  ${render(player.dice)}  = **${player.total}**`,
        `Bot:  ${render(bot.dice)}  = **${bot.total}**`,
        `${label} Net: **${sign}${delta.toLocaleString()}** • Balance: **${balance.toLocaleString()}**`,
      ].join('\n'),
    );
  },
};
