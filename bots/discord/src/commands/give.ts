import { SlashCommandBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import { credit, getBalance, tryDebit } from '../gambling/wallet.ts';
import type { Command } from './types.ts';

export const give: Command = {
  data: new SlashCommandBuilder()
    .setName('give')
    .setDescription('Give some of your coins to another player')
    .addUserOption((opt) =>
      opt.setName('user').setDescription('Who to give coins to').setRequired(true),
    )
    .addIntegerOption((opt) =>
      opt
        .setName('amount')
        .setDescription('How many coins to give')
        .setRequired(true)
        .setMinValue(1),
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    const target = interaction.options.getUser('user', true);
    const amount = interaction.options.getInteger('amount', true);
    const giverId = interaction.user.id;

    if (target.bot) {
      await interaction.reply({
        content: 'You can only give coins to a real player.',
        ephemeral: true,
      });
      return;
    }
    if (target.id === giverId) {
      await interaction.reply({
        content: 'You can not give coins to yourself.',
        ephemeral: true,
      });
      return;
    }

    const ok = await tryDebit(giverId, amount);
    if (!ok) {
      const balance = await getBalance(giverId);
      await interaction.reply({
        content: `Not enough coins. You have **${balance.toLocaleString()}**, tried to give **${amount.toLocaleString()}**.`,
        ephemeral: true,
      });
      return;
    }

    const targetBalance = await credit(target.id, amount);
    const giverBalance = await getBalance(giverId);

    await interaction.reply({
      content:
        `<@${giverId}> gave **${amount.toLocaleString()}** coins to <@${target.id}>.\n` +
        `${target.username} now has **${targetBalance.toLocaleString()}** coins. ` +
        `You have **${giverBalance.toLocaleString()}** left.`,
      allowedMentions: { users: [target.id] },
    });
  },
};
