import { SlashCommandBuilder } from 'discord.js';
import { useQueue } from 'discord-player';
import type { Command } from './types.ts';

export const resume: Command = {
  data: new SlashCommandBuilder().setName('resume').setDescription('Resume playback'),
  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    const queue = useQueue(interaction.guildId);
    if (!queue || !queue.currentTrack) {
      await interaction.reply({ content: 'Nothing is playing.', ephemeral: true });
      return;
    }
    queue.node.setPaused(false);
    await interaction.reply('Resumed.');
  },
};
