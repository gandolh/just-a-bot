import { SlashCommandBuilder } from 'discord.js';
import { getActiveQueue } from './_music.ts';
import type { Command } from './types.ts';

export const pause: Command = {
  data: new SlashCommandBuilder().setName('pause').setDescription('Pause playback'),
  async execute(interaction) {
    const queue = await getActiveQueue(interaction);
    if (!queue) return;
    queue.node.setPaused(true);
    await interaction.reply('Paused.');
  },
};
