import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
  User,
} from 'discord.js';
import {
  Ability,
  CharacterSheet,
  loadWorld,
  modifier,
  updateWorld,
} from '../dnd/world.ts';
import type { Command } from './types.ts';

const ABILITIES: Ability[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

async function requireWorld(interaction: ChatInputCommandInteraction) {
  if (!interaction.inCachedGuild()) {
    await interaction.reply({ content: 'Use this in a server.', ephemeral: true });
    return null;
  }
  const world = await loadWorld(interaction.guildId!);
  if (!world) {
    await interaction.reply({
      content: 'No world exists in this server yet. The DM should run `/dm world init` first.',
      ephemeral: true,
    });
    return null;
  }
  return world;
}

function renderSheet(sheet: CharacterSheet, ownerTag: string): EmbedBuilder {
  const abil = (a: Ability) => {
    const v = sheet.abilities[a];
    const m = modifier(v);
    return `${a.toUpperCase()} ${v} (${m >= 0 ? '+' : ''}${m})`;
  };
  const embed = new EmbedBuilder()
    .setColor(0xd35400)
    .setTitle(`🛡️ ${sheet.name}`)
    .setDescription(`*Level ${sheet.level} ${sheet.race} ${sheet.class}* — ${ownerTag}`)
    .addFields(
      { name: 'HP', value: `${sheet.hp.current}/${sheet.hp.max}${sheet.hp.temp ? ` (+${sheet.hp.temp} temp)` : ''}`, inline: true },
      { name: 'AC', value: `${sheet.ac}`, inline: true },
      { name: 'Speed', value: `${sheet.speed} ft`, inline: true },
      { name: 'Abilities', value: ABILITIES.map(abil).join(' • ') },
      { name: 'Proficiency', value: `+${sheet.proficiencyBonus}`, inline: true },
      { name: 'Saves', value: sheet.proficiencies.savingThrows.map((s) => s.toUpperCase()).join(', ') || '—', inline: true },
      { name: 'Skills', value: sheet.proficiencies.skills.join(', ') || '—', inline: true },
    );
  const eq = sheet.equipped;
  const eqStr = [
    eq.mainHand && `Main: ${eq.mainHand}`,
    eq.offHand && `Off: ${eq.offHand}`,
    eq.armor && `Armor: ${eq.armor}`,
  ].filter(Boolean).join(' • ');
  if (eqStr) embed.addFields({ name: 'Equipped', value: eqStr });
  if (sheet.inventory.length) {
    embed.addFields({
      name: 'Inventory',
      value: sheet.inventory.map((i) => `• ${i.item} ×${i.qty}`).join('\n'),
    });
  }
  if (sheet.conditions.length) {
    embed.addFields({ name: 'Conditions', value: sheet.conditions.join(', ') });
  }
  if (sheet.notes) embed.setFooter({ text: sheet.notes });
  return embed;
}

export const char: Command = {
  data: new SlashCommandBuilder()
    .setName('char')
    .setDescription('Manage your D&D character sheet')
    .addSubcommand((sub) =>
      sub
        .setName('create')
        .setDescription('Create your character (one per world)')
        .addStringOption((o) => o.setName('name').setDescription('Character name').setRequired(true))
        .addStringOption((o) => o.setName('class').setDescription('Class (fighter, wizard, …)').setRequired(true))
        .addStringOption((o) => o.setName('race').setDescription('Race').setRequired(true))
        .addIntegerOption((o) => o.setName('str').setDescription('STR (1-20)').setMinValue(1).setMaxValue(20).setRequired(true))
        .addIntegerOption((o) => o.setName('dex').setDescription('DEX').setMinValue(1).setMaxValue(20).setRequired(true))
        .addIntegerOption((o) => o.setName('con').setDescription('CON').setMinValue(1).setMaxValue(20).setRequired(true))
        .addIntegerOption((o) => o.setName('int').setDescription('INT').setMinValue(1).setMaxValue(20).setRequired(true))
        .addIntegerOption((o) => o.setName('wis').setDescription('WIS').setMinValue(1).setMaxValue(20).setRequired(true))
        .addIntegerOption((o) => o.setName('cha').setDescription('CHA').setMinValue(1).setMaxValue(20).setRequired(true))
        .addIntegerOption((o) => o.setName('hp').setDescription('Max HP').setMinValue(1).setMaxValue(999).setRequired(true))
        .addIntegerOption((o) => o.setName('ac').setDescription('Armor Class').setMinValue(1).setMaxValue(30).setRequired(true))
        .addIntegerOption((o) => o.setName('level').setDescription('Level (default 1)').setMinValue(1).setMaxValue(20))
        .addStringOption((o) => o.setName('glyph').setDescription('Map emoji for your character (e.g. 🧙)')),
    )
    .addSubcommand((sub) =>
      sub
        .setName('show')
        .setDescription('Show a character sheet')
        .addUserOption((o) => o.setName('user').setDescription("Whose sheet? (default: yours)")),
    )
    .addSubcommand((sub) =>
      sub
        .setName('hp')
        .setDescription('Adjust HP')
        .addIntegerOption((o) => o.setName('delta').setDescription('Change (use negative for damage)'))
        .addIntegerOption((o) => o.setName('set').setDescription('Set current HP to exact value'))
        .addIntegerOption((o) => o.setName('temp').setDescription('Set temp HP')),
    )
    .addSubcommand((sub) =>
      sub
        .setName('condition')
        .setDescription('Add or remove a condition')
        .addStringOption((o) =>
          o.setName('action').setDescription('add or remove').setRequired(true).addChoices(
            { name: 'add', value: 'add' },
            { name: 'remove', value: 'remove' },
          ),
        )
        .addStringOption((o) => o.setName('name').setDescription('Condition (prone, poisoned, …)').setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('equip')
        .setDescription('Equip an item from your inventory')
        .addStringOption((o) =>
          o.setName('slot').setDescription('Slot').setRequired(true).addChoices(
            { name: 'main hand', value: 'mainHand' },
            { name: 'off hand', value: 'offHand' },
            { name: 'armor', value: 'armor' },
          ),
        )
        .addStringOption((o) => o.setName('item').setDescription('Item name (empty to unequip)')),
    )
    .addSubcommand((sub) =>
      sub
        .setName('inv')
        .setDescription('Add or remove inventory items')
        .addStringOption((o) =>
          o.setName('action').setDescription('Action').setRequired(true).addChoices(
            { name: 'add', value: 'add' },
            { name: 'remove', value: 'remove' },
          ),
        )
        .addStringOption((o) => o.setName('item').setDescription('Item name').setRequired(true))
        .addIntegerOption((o) => o.setName('qty').setDescription('Quantity (default 1)').setMinValue(1)),
    )
    .addSubcommand((sub) =>
      sub.setName('delete').setDescription('Delete your character (irreversible)'),
    ),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand(true);
    const world = await requireWorld(interaction);
    if (!world) return;
    const userId = interaction.user.id;
    const guildId = interaction.guildId!;

    if (sub === 'create') {
      if (world.characters[userId]) {
        await interaction.reply({
          content: `You already have a character (**${world.characters[userId].name}**). Use \`/char delete\` first.`,
          ephemeral: true,
        });
        return;
      }
      const hp = interaction.options.getInteger('hp', true);
      const sheet: CharacterSheet = {
        name: interaction.options.getString('name', true),
        class: interaction.options.getString('class', true),
        race: interaction.options.getString('race', true),
        level: interaction.options.getInteger('level') ?? 1,
        abilities: {
          str: interaction.options.getInteger('str', true),
          dex: interaction.options.getInteger('dex', true),
          con: interaction.options.getInteger('con', true),
          int: interaction.options.getInteger('int', true),
          wis: interaction.options.getInteger('wis', true),
          cha: interaction.options.getInteger('cha', true),
        },
        proficiencyBonus: 2,
        proficiencies: { savingThrows: [], skills: [] },
        hp: { current: hp, max: hp, temp: 0 },
        ac: interaction.options.getInteger('ac', true),
        speed: 30,
        conditions: [],
        equipped: {},
        inventory: [],
        spellSlots: {},
        knownSpells: [],
        notes: '',
      };
      const glyph = interaction.options.getString('glyph');
      if (glyph) sheet.glyph = glyph;
      await updateWorld(guildId, (w) => {
        w.characters[userId] = sheet;
      });
      await interaction.reply({ embeds: [renderSheet(sheet, interaction.user.toString())] });
      return;
    }

    if (sub === 'show') {
      const target: User = interaction.options.getUser('user') ?? interaction.user;
      const sheet = world.characters[target.id];
      if (!sheet) {
        await interaction.reply({
          content: target.id === userId
            ? "You don't have a character yet. Run `/char create`."
            : `${target.toString()} has no character in this world.`,
          ephemeral: true,
        });
        return;
      }
      await interaction.reply({ embeds: [renderSheet(sheet, target.toString())] });
      return;
    }

    if (!world.characters[userId]) {
      await interaction.reply({ content: "You don't have a character yet. Run `/char create`.", ephemeral: true });
      return;
    }

    if (sub === 'hp') {
      const delta = interaction.options.getInteger('delta');
      const set = interaction.options.getInteger('set');
      const temp = interaction.options.getInteger('temp');
      if (delta === null && set === null && temp === null) {
        await interaction.reply({ content: 'Provide `delta`, `set`, or `temp`.', ephemeral: true });
        return;
      }
      let next: CharacterSheet;
      await updateWorld(guildId, (w) => {
        const s = w.characters[userId];
        if (set !== null) s.hp.current = Math.max(0, Math.min(s.hp.max, set));
        if (delta !== null) s.hp.current = Math.max(0, Math.min(s.hp.max, s.hp.current + delta));
        if (temp !== null) s.hp.temp = Math.max(0, temp);
        next = s;
      });
      await interaction.reply(
        `**${next!.name}** — HP **${next!.hp.current}/${next!.hp.max}**${next!.hp.temp ? ` (+${next!.hp.temp} temp)` : ''}`,
      );
      return;
    }

    if (sub === 'condition') {
      const action = interaction.options.getString('action', true);
      const name = interaction.options.getString('name', true).toLowerCase();
      await updateWorld(guildId, (w) => {
        const s = w.characters[userId];
        const idx = s.conditions.indexOf(name);
        if (action === 'add' && idx === -1) s.conditions.push(name);
        if (action === 'remove' && idx !== -1) s.conditions.splice(idx, 1);
      });
      await interaction.reply(`${action === 'add' ? 'Added' : 'Removed'} condition **${name}**.`);
      return;
    }

    if (sub === 'equip') {
      const slot = interaction.options.getString('slot', true) as 'mainHand' | 'offHand' | 'armor';
      const item = interaction.options.getString('item');
      await updateWorld(guildId, (w) => {
        const s = w.characters[userId];
        if (item) {
          const has = s.inventory.some((i) => i.item === item);
          if (!has) throw new Error(`You don't have **${item}** in your inventory.`);
          s.equipped[slot] = item;
        } else {
          delete s.equipped[slot];
        }
      }).catch(async (err) => {
        await interaction.reply({ content: err.message, ephemeral: true });
        throw err;
      });
      if (interaction.replied) return;
      await interaction.reply(item ? `Equipped **${item}** in ${slot}.` : `Unequipped ${slot}.`);
      return;
    }

    if (sub === 'inv') {
      const action = interaction.options.getString('action', true);
      const item = interaction.options.getString('item', true);
      const qty = interaction.options.getInteger('qty') ?? 1;
      await updateWorld(guildId, (w) => {
        const s = w.characters[userId];
        const idx = s.inventory.findIndex((i) => i.item === item);
        if (action === 'add') {
          if (idx === -1) s.inventory.push({ item, qty });
          else s.inventory[idx].qty += qty;
        } else {
          if (idx === -1) return;
          s.inventory[idx].qty -= qty;
          if (s.inventory[idx].qty <= 0) s.inventory.splice(idx, 1);
        }
      });
      await interaction.reply(`${action === 'add' ? 'Added' : 'Removed'} **${item}** ×${qty}.`);
      return;
    }

    if (sub === 'delete') {
      const name = world.characters[userId].name;
      await updateWorld(guildId, (w) => {
        delete w.characters[userId];
        for (const [eid, e] of Object.entries(w.entities)) {
          if (e.kind === 'pc' && e.characterId === userId) delete w.entities[eid];
        }
      });
      await interaction.reply({ content: `Deleted **${name}**.`, ephemeral: true });
      return;
    }
  },
};
