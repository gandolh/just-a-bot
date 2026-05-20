import { GuildMember, SlashCommandBuilder } from 'discord.js';
import { QueryType } from 'discord-player';
import { getPlayer } from '../player.ts';
import type { Command } from './types.ts';

export const play: Command = {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Play a song or add it to the queue')
    .addStringOption((opt) =>
      opt.setName('query').setDescription('YouTube/Spotify URL or search query').setRequired(true),
    ),
  async execute(interaction) {
    if (!interaction.inCachedGuild()) {
      await interaction.reply({ content: 'This command only works in a server.', ephemeral: true });
      return;
    }

    const member = interaction.member as GuildMember;
    const voiceChannel = member.voice.channel;
    if (!voiceChannel) {
      await interaction.reply({ content: 'Join a voice channel first.', ephemeral: true });
      return;
    }

    const query = interaction.options.getString('query', true);
    await interaction.deferReply();

    const player = getPlayer();
    try {
      const { track } = await player.play(voiceChannel as never, query, {
        searchEngine: QueryType.YOUTUBE_SEARCH,
        nodeOptions: {
          metadata: { channel: interaction.channel },
          leaveOnEnd: true,
          leaveOnEndCooldown: 60_000,
          leaveOnEmpty: true,
          leaveOnEmptyCooldown: 60_000,
          selfDeaf: true,
          volume: 80,
        },
      });

      await interaction.followUp(`Queued: **${track.title}**`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await interaction.followUp(`Failed to play: ${message}`);
    }
  },
};
