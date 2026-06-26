import { SlashCommandBuilder } from 'discord.js';
import { getActiveQueue } from './_music.ts';
import type { Command } from './types.ts';

export const nowplaying: Command = {
  data: new SlashCommandBuilder()
    .setName('nowplaying')
    .setDescription('Show the currently playing track'),
  async execute(interaction) {
    const queue = await getActiveQueue(interaction);
    if (!queue) return;
    const track = queue.currentTrack!;
    const bar = queue.node.createProgressBar({ length: 18 });
    await interaction.reply(`**${track.title}**\n${bar ?? ''}`);
  },
};
