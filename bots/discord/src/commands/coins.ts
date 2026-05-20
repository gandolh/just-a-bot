import { SlashCommandBuilder } from 'discord.js';
import { addCoins, getBalance, MAX_ADD } from '../wallet.ts';
import type { Command } from './types.ts';

export const coins: Command = {
  data: new SlashCommandBuilder()
    .setName('coins')
    .setDescription('Manage your hypothetical gambling coins')
    .addSubcommand((sub) =>
      sub.setName('balance').setDescription('Show your current coin balance'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription(`Add coins to your account (0 - ${MAX_ADD.toLocaleString()})`)
        .addIntegerOption((opt) =>
          opt
            .setName('amount')
            .setDescription(`Amount of coins to add (0 - ${MAX_ADD.toLocaleString()})`)
            .setRequired(true)
            .setMinValue(0)
            .setMaxValue(MAX_ADD),
        ),
    ),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand(true);
    const userId = interaction.user.id;

    if (sub === 'balance') {
      const balance = await getBalance(userId);
      await interaction.reply({
        content: `You have **${balance.toLocaleString()}** coins.`,
        ephemeral: true,
      });
      return;
    }

    if (sub === 'add') {
      const amount = interaction.options.getInteger('amount', true);
      if (!Number.isInteger(amount) || amount < 0 || amount > MAX_ADD) {
        await interaction.reply({
          content: `Pick an amount between 0 and ${MAX_ADD.toLocaleString()}.`,
          ephemeral: true,
        });
        return;
      }
      const newBalance = await addCoins(userId, amount);
      await interaction.reply({
        content: `Added **${amount.toLocaleString()}** coins. New balance: **${newBalance.toLocaleString()}**.`,
        ephemeral: true,
      });
    }
  },
};
