import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import {
  ConditionData,
  EquipmentData,
  lookup,
  MonsterData,
  SpellData,
} from '../dnd/srd.ts';
import type { Command } from './types.ts';

const COLOR = 0x2ecc71;

function trim(text: string, max = 1024): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + '…';
}

function abilityLine(m: MonsterData): string {
  const mod = (n: number) => {
    const m = Math.floor((n - 10) / 2);
    return `${n} (${m >= 0 ? '+' : ''}${m})`;
  };
  return [
    `STR ${mod(m.strength)}`,
    `DEX ${mod(m.dexterity)}`,
    `CON ${mod(m.constitution)}`,
    `INT ${mod(m.intelligence)}`,
    `WIS ${mod(m.wisdom)}`,
    `CHA ${mod(m.charisma)}`,
  ].join(' • ');
}

function notFound(thing: string, query: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle(`${thing} not found`)
    .setDescription(`No SRD ${thing.toLowerCase()} matching **${query}**.`);
}

export const spell: Command = {
  data: new SlashCommandBuilder()
    .setName('spell')
    .setDescription('Look up a D&D 5e SRD spell')
    .addStringOption((o) => o.setName('name').setDescription('Spell name').setRequired(true)),
  async execute(interaction) {
    const query = interaction.options.getString('name', true);
    await interaction.deferReply();
    const data = await lookup<SpellData>('spells', query);
    if (!data) {
      await interaction.editReply({ embeds: [notFound('Spell', query)] });
      return;
    }
    const embed = new EmbedBuilder()
      .setColor(COLOR)
      .setTitle(`✨ ${data.name}`)
      .setDescription(
        `*${data.level === 0 ? 'Cantrip' : `Level ${data.level}`} ${data.school.name}${data.ritual ? ' (ritual)' : ''}*`,
      )
      .addFields(
        { name: 'Casting Time', value: data.casting_time, inline: true },
        { name: 'Range', value: data.range, inline: true },
        { name: 'Duration', value: `${data.concentration ? 'Concentration, ' : ''}${data.duration}`, inline: true },
        { name: 'Components', value: data.components.join(', ') + (data.material ? ` (${data.material})` : ''), inline: false },
        { name: 'Description', value: trim(data.desc.join('\n\n')) },
      );
    if (data.higher_level && data.higher_level.length > 0) {
      embed.addFields({ name: 'At Higher Levels', value: trim(data.higher_level.join('\n')) });
    }
    if (data.classes.length > 0) {
      embed.setFooter({ text: `Classes: ${data.classes.map((c) => c.name).join(', ')}` });
    }
    await interaction.editReply({ embeds: [embed] });
  },
};

export const monster: Command = {
  data: new SlashCommandBuilder()
    .setName('monster')
    .setDescription('Look up a D&D 5e SRD monster')
    .addStringOption((o) => o.setName('name').setDescription('Monster name').setRequired(true)),
  async execute(interaction) {
    const query = interaction.options.getString('name', true);
    await interaction.deferReply();
    const data = await lookup<MonsterData>('monsters', query);
    if (!data) {
      await interaction.editReply({ embeds: [notFound('Monster', query)] });
      return;
    }
    const ac = data.armor_class[0]?.value ?? '?';
    const speed = Object.entries(data.speed).map(([k, v]) => `${k} ${v}`).join(', ');
    const embed = new EmbedBuilder()
      .setColor(COLOR)
      .setTitle(`👹 ${data.name}`)
      .setDescription(`*${data.size} ${data.type}, ${data.alignment}*`)
      .addFields(
        { name: 'AC', value: `${ac}`, inline: true },
        { name: 'HP', value: `${data.hit_points} (${data.hit_dice})`, inline: true },
        { name: 'Speed', value: speed || '—', inline: true },
        { name: 'Abilities', value: abilityLine(data) },
        { name: 'CR', value: `${data.challenge_rating} (${data.xp} XP)`, inline: true },
      );
    if (data.special_abilities && data.special_abilities.length > 0) {
      embed.addFields({
        name: 'Traits',
        value: trim(
          data.special_abilities
            .slice(0, 5)
            .map((a) => `**${a.name}.** ${a.desc}`)
            .join('\n\n'),
        ),
      });
    }
    if (data.actions && data.actions.length > 0) {
      embed.addFields({
        name: 'Actions',
        value: trim(
          data.actions
            .slice(0, 5)
            .map((a) => `**${a.name}.** ${a.desc}`)
            .join('\n\n'),
        ),
      });
    }
    await interaction.editReply({ embeds: [embed] });
  },
};

export const item: Command = {
  data: new SlashCommandBuilder()
    .setName('item')
    .setDescription('Look up a D&D 5e SRD piece of equipment')
    .addStringOption((o) => o.setName('name').setDescription('Item name').setRequired(true)),
  async execute(interaction) {
    const query = interaction.options.getString('name', true);
    await interaction.deferReply();
    const data = await lookup<EquipmentData>('equipment', query);
    if (!data) {
      await interaction.editReply({ embeds: [notFound('Item', query)] });
      return;
    }
    const embed = new EmbedBuilder()
      .setColor(COLOR)
      .setTitle(`⚔️ ${data.name}`)
      .setDescription(`*${data.equipment_category.name}${data.weapon_category ? ` (${data.weapon_category})` : ''}*`);
    const facts: string[] = [];
    if (data.cost) facts.push(`Cost: ${data.cost.quantity} ${data.cost.unit}`);
    if (data.weight !== undefined) facts.push(`Weight: ${data.weight} lb`);
    if (data.damage) facts.push(`Damage: ${data.damage.damage_dice} ${data.damage.damage_type.name}`);
    if (data.range) facts.push(`Range: ${data.range.normal}${data.range.long ? `/${data.range.long}` : ''} ft`);
    if (data.armor_class) facts.push(`AC: ${data.armor_class.base}${data.armor_class.dex_bonus ? ' + Dex' : ''}`);
    if (facts.length) embed.addFields({ name: 'Stats', value: facts.join(' • ') });
    if (data.desc && data.desc.length) {
      embed.addFields({ name: 'Description', value: trim(data.desc.join('\n')) });
    }
    await interaction.editReply({ embeds: [embed] });
  },
};

export const condition: Command = {
  data: new SlashCommandBuilder()
    .setName('condition')
    .setDescription('Look up a D&D 5e SRD condition')
    .addStringOption((o) => o.setName('name').setDescription('Condition name').setRequired(true)),
  async execute(interaction) {
    const query = interaction.options.getString('name', true);
    await interaction.deferReply();
    const data = await lookup<ConditionData>('conditions', query);
    if (!data) {
      await interaction.editReply({ embeds: [notFound('Condition', query)] });
      return;
    }
    const embed = new EmbedBuilder()
      .setColor(COLOR)
      .setTitle(`🌀 ${data.name}`)
      .setDescription(trim(data.desc.join('\n')));
    await interaction.editReply({ embeds: [embed] });
  },
};
