import { SlashCommandBuilder } from 'discord.js';
import { getActiveQueue } from './_music.ts';
import type { Command } from './types.ts';

export const resume: Command = {
  data: new SlashCommandBuilder().setName('resume').setDescription('Resume playback'),
  async execute(interaction) {
    const queue = await getActiveQueue(interaction);
    if (!queue) return;
    queue.node.setPaused(false);
    await interaction.reply('Resumed.');
  },
};
