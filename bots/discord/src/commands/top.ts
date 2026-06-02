import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
} from 'discord.js';
import type { Command } from './types.ts';
import { type Category, getLeaderboard } from '../leaderboard/queries.ts';

const CATEGORY_LABELS: Record<Category, { title: string; unit: string; global: boolean }> = {
  coins:      { title: 'Coins',      unit: 'coins',  global: true },
  'rpg-xp':   { title: 'RPG XP',    unit: 'XP',     global: false },
  'rpg-kills':{ title: 'RPG Kills',  unit: 'kills',  global: false },
  'rpg-coins':{ title: 'RPG Coins',  unit: 'coins',  global: false },
};

const data = new SlashCommandBuilder()
  .setName('top')
  .setDescription('Show the top 10 players for a category')
  .addStringOption((o) =>
    o
      .setName('category')
      .setDescription('Which leaderboard to show')
      .setRequired(true)
      .addChoices(
        { name: 'Coins (wallet)', value: 'coins' },
        { name: 'RPG XP',        value: 'rpg-xp' },
        { name: 'RPG Kills',     value: 'rpg-kills' },
        { name: 'RPG Coins',     value: 'rpg-coins' },
      ),
  );

export const top: Command = {
  data,
  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inGuild()) {
      await interaction.reply({ content: 'Use this in a server.', ephemeral: true });
      return;
    }

    const category = interaction.options.getString('category', true) as Category;
    const meta = CATEGORY_LABELS[category];
    const entries = await getLeaderboard(category, interaction.guildId);

    if (entries.length === 0) {
      await interaction.reply({ content: `No data yet for **${meta.title}**.`, ephemeral: true });
      return;
    }

    // Resolve Discord display names for users still in the guild. Fetch the guild
    // on demand rather than relying on it being in the cache.
    const ids = entries.map((e) => e.userId);
    const guild = await interaction.client.guilds.fetch(interaction.guildId).catch(() => null);
    const members = await guild?.members.fetch({ user: ids }).catch(() => null) ?? null;

    const lines = entries.map((e, i) => {
      const memberName = members?.get(e.userId)?.displayName;
      const displayName = e.label ?? memberName ?? 'Unknown user';
      return `**${i + 1}.** ${displayName} — ${e.score.toLocaleString()} ${meta.unit}`;
    });

    const footerParts: string[] = [new Date().toUTCString()];
    if (meta.global) footerParts.push('global ranking');

    const embed = new EmbedBuilder()
      .setColor(0xf39c12)
      .setTitle(`🏆 Top by ${meta.title}`)
      .setDescription(lines.join('\n'))
      .setFooter({ text: footerParts.join(' • ') });

    await interaction.reply({ embeds: [embed] });
  },
};
