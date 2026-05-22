import { SlashCommandBuilder } from 'discord.js';
import type { Command } from './types.ts';
import { env } from '../env.ts';

export const mafia2: Command = {
  data: new SlashCommandBuilder()
    .setName('mafia2')
    .setDescription('Voice-channel Mafia (Activity-based variant of /mafia)')
    .addSubcommand((s) =>
      s.setName('launch').setDescription('Post the link to open Mafia2 in your voice channel'),
    ),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'launch') {
      const url = env.MAFIA2_ACTIVITY_URL;
      if (!url) {
        await interaction.reply({
          content: 'Mafia2 Activity is not configured on this server yet (missing `MAFIA2_ACTIVITY_URL`).',
          ephemeral: true,
        });
        return;
      }
      await interaction.reply({
        content: `🎭 **Mafia2** is ready to launch.\nJoin a voice channel, then click the rocket-ship to start an Activity. Direct link: ${url}`,
      });
    }
  },
};
