import { SlashCommandBuilder } from 'discord.js';
import { getActiveQueue } from './_music.ts';
import type { Command } from './types.ts';

export const stop: Command = {
  data: new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Stop playback, clear the queue, and leave the voice channel'),
  async execute(interaction) {
    const queue = await getActiveQueue(interaction, { requireTrack: false });
    if (!queue) return;
    queue.delete();
    await interaction.reply('Stopped and cleared the queue.');
  },
};
