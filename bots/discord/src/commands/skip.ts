import { SlashCommandBuilder } from 'discord.js';
import { getActiveQueue } from './_music.ts';
import type { Command } from './types.ts';

export const skip: Command = {
  data: new SlashCommandBuilder().setName('skip').setDescription('Skip the current track'),
  async execute(interaction) {
    const queue = await getActiveQueue(interaction);
    if (!queue) return;
    const title = queue.currentTrack!.title;
    queue.node.skip();
    await interaction.reply(`Skipped: **${title}**`);
  },
};
