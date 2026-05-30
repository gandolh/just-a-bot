import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import type { Command } from './types.ts';

interface Entry {
  name: string;
  desc: string;
}

interface Group {
  title: string;
  emoji: string;
  entries?: Entry[];
  text?: string;
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
    title: 'Games',
    emoji: '🎮',
    entries: [
      { name: '/wordle', desc: 'Start a Wordle game in a thread (type guesses, `delete` removes it)' },
      { name: '/tictactoe', desc: 'Play tic-tac-toe with buttons (mention an opponent or play the bot)' },
    ],
  },
  {
    title: 'RPG',
    emoji: '🐉',
    text: [
      'A shared persistent world per server. Drop in, fight mobs, level up.',
      '',
      '**Join & info:** `/rpg join` `/rpg me` `/rpg leave` `/rpg top`',
      '**Play:** `/rpg move <dir>` `/rpg look` `/rpg attack` `/rpg pickup` `/rpg use` `/rpg map`',
      '',
      'Mobs spawn automatically and hunt down adventurers in range.',
      'Walk over loot to auto-collect. Die → respawn at the plaza, drop half your coins.',
    ].join('\n'),
  },
  // {
  //   title: 'D&D',
  //   emoji: '🐲',
  //   text: [
  //     'Tabletop campaign in chat. One DM narrates; players act.',
  //     '',
  //     '**Setup:** `/dnd setup` (claim DM) • `/dnd end` • `/dnd status`',
  //     '**Players:** `/dnd join name:… class:…` `/dnd sheet` `/dnd hp <delta>` `/dnd leave`',
  //     '**Anyone rolls:** `/dnd roll 1d20+5` `/dnd check ability:dex` `/dnd say text:…`',
  //     '**DM narration:** `/dnd narrate`, `/dnd npc`, `/dnd scene`, `/dnd whisper`, `/dnd dmroll`',
  //     '**DM combat:** `/dnd init` • `/dnd next` • `/dnd endcombat` • `/dnd monster`',
  //     '**DM bookkeeping:** `/dnd damage <target>`, `/dnd heal <target>`, `/dnd xp`, `/dnd give`',
  //   ].join('\n'),
  // },
  {
    title: 'Misc',
    emoji: '🛠️',
    entries: [
      { name: '/ping', desc: 'Health check' },
      { name: '/ask', desc: 'Ask an Ollama-hosted model a question' },
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
      const value = group.text
        ?? group.entries!.map((e) => `\`${e.name}\` — ${e.desc}`).join('\n');
      embed.addFields({ name: `${group.emoji} ${group.title}`, value });
    }

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
