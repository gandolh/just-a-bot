import { SlashCommandBuilder } from 'discord.js';
import { getActiveQueue } from './_music.ts';
import type { Command } from './types.ts';

const MAX_LISTED = 10;

export const queue: Command = {
  data: new SlashCommandBuilder().setName('queue').setDescription('Show the current queue'),
  async execute(interaction) {
    const q = await getActiveQueue(interaction, {
      requireTrack: false,
      emptyMessage: 'The queue is empty.',
    });
    if (!q) return;
    if (!q.currentTrack && q.tracks.size === 0) {
      await interaction.reply({ content: 'The queue is empty.', ephemeral: true });
      return;
    }

    const upcoming = q.tracks
      .toArray()
      .slice(0, MAX_LISTED)
      .map((t, i) => `${i + 1}. ${t.title} — ${t.duration}`)
      .join('\n');

    const remaining = Math.max(0, q.tracks.size - MAX_LISTED);
    const now = q.currentTrack
      ? `**Now playing:** ${q.currentTrack.title} — ${q.currentTrack.duration}`
      : '';
    const next = upcoming
      ? `\n**Up next:**\n${upcoming}${remaining > 0 ? `\n…and ${remaining} more` : ''}`
      : '';

    await interaction.reply(`${now}${next}` || 'Queue is empty.');
  },
};
