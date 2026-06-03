import { SlashCommandBuilder } from 'discord.js';
import type { Command } from './types.ts';
import { env } from '../env.ts';

export const dicetable: Command = {
  data: new SlashCommandBuilder()
    .setName('dicetable')
    .setDescription('Voice-channel dice table — everyone antes, biggest roll takes the pot')
    .addSubcommand((s) =>
      s.setName('launch').setDescription('Post the link to open the Dice Table in your voice channel'),
    ),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'launch') {
      const url = env.DICETABLE_ACTIVITY_URL;
      if (!url) {
        await interaction.reply({
          content: 'The Dice Table Activity is not configured on this server yet (missing `DICETABLE_ACTIVITY_URL`).',
          ephemeral: true,
        });
        return;
      }
      await interaction.reply({
        content: `🎲 **Dice Table** is ready to launch.\nJoin a voice channel, then click the rocket-ship to start an Activity. Direct link: ${url}`,
      });
    }
  },
};
