import { SlashCommandBuilder } from 'discord.js';
import { useQueue } from 'discord-player';
import type { Command } from './types.js';

export const skip: Command = {
  data: new SlashCommandBuilder().setName('skip').setDescription('Skip the current track'),
  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    const queue = useQueue(interaction.guildId);
    if (!queue || !queue.currentTrack) {
      await interaction.reply({ content: 'Nothing is playing.', ephemeral: true });
      return;
    }
    const title = queue.currentTrack.title;
    queue.node.skip();
    await interaction.reply(`Skipped: **${title}**`);
  },
};
