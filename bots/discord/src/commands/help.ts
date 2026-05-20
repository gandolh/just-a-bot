import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import type { Command } from './types.ts';

interface Entry {
  name: string;
  desc: string;
}

interface Group {
  title: string;
  emoji: string;
  entries: Entry[];
}

const GROUPS: Group[] = [
  {
    title: 'Music',
    emoji: '🎵',
    entries: [
      { name: '/play', desc: 'Play a song or add it to the queue' },
      { name: '/skip', desc: 'Skip the current track' },
      { name: '/pause', desc: 'Pause playback' },
      { name: '/resume', desc: 'Resume playback' },
      { name: '/stop', desc: 'Stop and clear the queue' },
      { name: '/queue', desc: 'Show the queue' },
      { name: '/nowplaying', desc: 'Show the current track' },
    ],
  },
  {
    title: 'Gambling',
    emoji: '🎰',
    entries: [
      { name: '/coins balance', desc: 'Show your current coin balance' },
      { name: '/coins add', desc: 'Add coins to your account (0 – 100,000)' },
      { name: '/slots', desc: '5×5 slot machine, 12 paylines' },
      { name: '/blackjack', desc: 'Play a hand vs the dealer (hit / stand / double)' },
      { name: '/dice', desc: 'Roll 2d6 against the bot — biggest dice wins' },
    ],
  },
  {
    title: 'Misc',
    emoji: '🛠️',
    entries: [
      { name: '/ping', desc: 'Health check' },
      { name: '/help', desc: 'Show this message' },
    ],
  },
];

export const help: Command = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show all available commands'),
  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setTitle('just-a-bot — commands')
      .setColor(0x5865f2)
      .setDescription('Coins are hypothetical. No real payments are made.');

    for (const group of GROUPS) {
      const value = group.entries
        .map((e) => `\`${e.name}\` — ${e.desc}`)
        .join('\n');
      embed.addFields({ name: `${group.emoji} ${group.title}`, value });
    }

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
