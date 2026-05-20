import { SlashCommandBuilder } from 'discord.js';
import { useQueue } from 'discord-player';
import type { Command } from './types.js';

export const nowplaying: Command = {
  data: new SlashCommandBuilder()
    .setName('nowplaying')
    .setDescription('Show the currently playing track'),
  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    const queue = useQueue(interaction.guildId);
    if (!queue || !queue.currentTrack) {
      await interaction.reply({ content: 'Nothing is playing.', ephemeral: true });
      return;
    }
    const track = queue.currentTrack;
    const bar = queue.node.createProgressBar({ length: 18 });
    await interaction.reply(`**${track.title}**\n${bar ?? ''}`);
  },
};
