import { SlashCommandBuilder } from 'discord.js';
import { useQueue } from 'discord-player';
import type { Command } from './types.ts';

export const stop: Command = {
  data: new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Stop playback, clear the queue, and leave the voice channel'),
  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    const queue = useQueue(interaction.guildId);
    if (!queue) {
      await interaction.reply({ content: 'Nothing is playing.', ephemeral: true });
      return;
    }
    queue.delete();
    await interaction.reply('Stopped and cleared the queue.');
  },
};
