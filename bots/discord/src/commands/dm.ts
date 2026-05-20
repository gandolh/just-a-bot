import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
} from 'discord.js';
import {
  createWorld,
  isDm,
  loadWorld,
  MonsterEntity,
  MonsterStatBlock,
  NpcEntity,
  setTerrain,
  ShopEntity,
  updateWorld,
  World,
  Zone,
} from '../dnd/world.ts';
import { lookup, MonsterData } from '../dnd/srd.ts';
import {
  advanceTurn,
  currentActor,
  logAction,
  rollInitiative,
  speedOf,
} from '../dnd/encounter.ts';
import { runMonsterTurn } from '../dnd/ai.ts';
import type { Command } from './types.ts';

async function requireWorld(
  interaction: ChatInputCommandInteraction,
): Promise<World | null> {
  if (!interaction.inCachedGuild()) {
    await interaction.reply({ content: 'Use this in a server.', ephemeral: true });
    return null;
  }
  const world = await loadWorld(interaction.guildId!);
  if (!world) {
    await interaction.reply({
      content: 'No world here yet. Run `/dm world init` to create one.',
      ephemeral: true,
    });
    return null;
  }
  return world;
}

async function requireDm(
  interaction: ChatInputCommandInteraction,
): Promise<World | null> {
  const world = await requireWorld(interaction);
  if (!world) return null;
  if (!isDm(world, interaction.user.id)) {
    await interaction.reply({ content: 'Only the DM can run this.', ephemeral: true });
    return null;
  }
  return world;
}

const TOKEN_CHOICES = [
  { name: '. open ground', value: '.' },
  { name: '# wall / building', value: '#' },
  { name: '~ water', value: '~' },
  { name: 'f forest', value: 'f' },
  { name: '^ mountain', value: '^' },
  { name: '= road', value: '=' },
  { name: '+ door', value: '+' },
  { name: '> stairs down', value: '>' },
  { name: '< stairs up', value: '<' },
];

function validToken(token: string): boolean {
  return /^[.#~f^=+><]$/.test(token);
}

function inBounds(world: World, row: number, col: number): boolean {
  return row >= 0 && row < world.overworld.height && col >= 0 && col < world.overworld.width;
}

function srdToStatBlock(data: MonsterData): MonsterStatBlock {
  return {
    size: data.size,
    type: data.type,
    alignment: data.alignment,
    speed: data.speed,
    abilities: {
      str: data.strength,
      dex: data.dexterity,
      con: data.constitution,
      int: data.intelligence,
      wis: data.wisdom,
      cha: data.charisma,
    },
    challengeRating: data.challenge_rating,
    xp: data.xp,
    specialAbilities: data.special_abilities ?? [],
    actions: data.actions ?? [],
  };
}

function paintLine(
  world: World,
  from: [number, number],
  to: [number, number],
  token: string,
): number {
  // Chebyshev step from->to, painting each cell.
  const [fr, fc] = from;
  const [tr, tc] = to;
  const steps = Math.max(Math.abs(tr - fr), Math.abs(tc - fc));
  let r = fr;
  let c = fc;
  let painted = 0;
  setTerrain(world, r, c, token);
  painted++;
  for (let i = 0; i < steps; i++) {
    r += Math.sign(tr - r);
    c += Math.sign(tc - c);
    setTerrain(world, r, c, token);
    painted++;
  }
  return painted;
}

function paintRect(
  world: World,
  row: number,
  col: number,
  width: number,
  height: number,
  token: string,
): number {
  let painted = 0;
  for (let r = row; r < row + height; r++) {
    for (let c = col; c < col + width; c++) {
      if (!inBounds(world, r, c)) continue;
      setTerrain(world, r, c, token);
      painted++;
    }
  }
  return painted;
}

export const dm: Command = {
  data: new SlashCommandBuilder()
    .setName('dm')
    .setDescription('Dungeon Master commands')
    .addSubcommandGroup((g) =>
      g
        .setName('world')
        .setDescription('World-level commands')
        .addSubcommand((s) =>
          s
            .setName('init')
            .setDescription('Create the world for this server (caller becomes DM)')
            .addStringOption((o) => o.setName('name').setDescription('World name').setRequired(true))
            .addIntegerOption((o) => o.setName('width').setDescription('Overworld width (default 100)').setMinValue(20).setMaxValue(255))
            .addIntegerOption((o) => o.setName('height').setDescription('Overworld height (default 100)').setMinValue(20).setMaxValue(255)),
        )
        .addSubcommand((s) =>
          s
            .setName('rename')
            .setDescription('Rename the world')
            .addStringOption((o) => o.setName('name').setDescription('New name').setRequired(true)),
        )
        .addSubcommand((s) => s.setName('info').setDescription('Show world summary'))
        .addSubcommand((s) =>
          s
            .setName('spawn')
            .setDescription('Set the player spawn point on the overworld')
            .addIntegerOption((o) => o.setName('row').setDescription('Spawn row').setMinValue(0).setRequired(true))
            .addIntegerOption((o) => o.setName('col').setDescription('Spawn column').setMinValue(0).setRequired(true)),
        ),
    )
    .addSubcommandGroup((g) =>
      g
        .setName('zone')
        .setDescription('Label a region of the overworld as a named zone')
        .addSubcommand((s) =>
          s
            .setName('create')
            .setDescription('Define a labeled rectangular region')
            .addStringOption((o) => o.setName('id').setDescription('Zone id (kebab-case)').setRequired(true))
            .addStringOption((o) => o.setName('name').setDescription('Display name').setRequired(true))
            .addIntegerOption((o) => o.setName('row').setDescription('Top-left row').setMinValue(0).setRequired(true))
            .addIntegerOption((o) => o.setName('col').setDescription('Top-left col').setMinValue(0).setRequired(true))
            .addIntegerOption((o) => o.setName('width').setDescription('Width (cells)').setMinValue(1).setMaxValue(255).setRequired(true))
            .addIntegerOption((o) => o.setName('height').setDescription('Height (cells)').setMinValue(1).setMaxValue(255).setRequired(true))
            .addStringOption((o) => o.setName('description').setDescription('Short description')),
        )
        .addSubcommand((s) =>
          s.setName('list').setDescription('List all zones in the world'),
        )
        .addSubcommand((s) =>
          s
            .setName('delete')
            .setDescription('Delete a zone label (does not erase terrain)')
            .addStringOption((o) => o.setName('id').setDescription('Zone id').setRequired(true)),
        ),
    )
    .addSubcommandGroup((g) =>
      g
        .setName('paint')
        .setDescription('Paint terrain on the overworld')
        .addSubcommand((s) =>
          s
            .setName('cell')
            .setDescription('Paint a single cell')
            .addIntegerOption((o) => o.setName('row').setDescription('Row').setMinValue(0).setRequired(true))
            .addIntegerOption((o) => o.setName('col').setDescription('Column').setMinValue(0).setRequired(true))
            .addStringOption((o) => o.setName('token').setDescription('Terrain').setRequired(true).addChoices(...TOKEN_CHOICES)),
        )
        .addSubcommand((s) =>
          s
            .setName('rect')
            .setDescription('Fill a rectangle')
            .addIntegerOption((o) => o.setName('row').setDescription('Top-left row').setMinValue(0).setRequired(true))
            .addIntegerOption((o) => o.setName('col').setDescription('Top-left col').setMinValue(0).setRequired(true))
            .addIntegerOption((o) => o.setName('width').setDescription('Width').setMinValue(1).setMaxValue(255).setRequired(true))
            .addIntegerOption((o) => o.setName('height').setDescription('Height').setMinValue(1).setMaxValue(255).setRequired(true))
            .addStringOption((o) => o.setName('token').setDescription('Terrain').setRequired(true).addChoices(...TOKEN_CHOICES)),
        )
        .addSubcommand((s) =>
          s
            .setName('line')
            .setDescription('Paint a straight (Chebyshev) line between two cells — useful for roads')
            .addIntegerOption((o) => o.setName('from-row').setDescription('Start row').setMinValue(0).setRequired(true))
            .addIntegerOption((o) => o.setName('from-col').setDescription('Start col').setMinValue(0).setRequired(true))
            .addIntegerOption((o) => o.setName('to-row').setDescription('End row').setMinValue(0).setRequired(true))
            .addIntegerOption((o) => o.setName('to-col').setDescription('End col').setMinValue(0).setRequired(true))
            .addStringOption((o) => o.setName('token').setDescription('Terrain (default =)').addChoices(...TOKEN_CHOICES)),
        ),
    )
    .addSubcommandGroup((g) =>
      g
        .setName('place')
        .setDescription('Place entities on the overworld')
        .addSubcommand((s) =>
          s
            .setName('monster')
            .setDescription('Place a monster (SRD stat block inlined)')
            .addStringOption((o) => o.setName('id').setDescription('Entity id (e.g. goblin-1)').setRequired(true))
            .addStringOption((o) => o.setName('srd').setDescription('SRD monster name (e.g. goblin)').setRequired(true))
            .addIntegerOption((o) => o.setName('row').setDescription('Row').setMinValue(0).setRequired(true))
            .addIntegerOption((o) => o.setName('col').setDescription('Column').setMinValue(0).setRequired(true))
            .addStringOption((o) => o.setName('name').setDescription('Display name (default: SRD name)'))
            .addStringOption((o) => o.setName('glyph').setDescription('Map emoji (e.g. 👹)')),
        )
        .addSubcommand((s) =>
          s
            .setName('npc')
            .setDescription('Place an NPC')
            .addStringOption((o) => o.setName('id').setDescription('Entity id').setRequired(true))
            .addStringOption((o) => o.setName('name').setDescription('Display name').setRequired(true))
            .addIntegerOption((o) => o.setName('row').setDescription('Row').setMinValue(0).setRequired(true))
            .addIntegerOption((o) => o.setName('col').setDescription('Column').setMinValue(0).setRequired(true))
            .addStringOption((o) => o.setName('dialogue').setDescription('Initial dialogue line'))
            .addStringOption((o) => o.setName('glyph').setDescription('Map emoji (e.g. 🧑‍🌾)')),
        )
        .addSubcommand((s) =>
          s
            .setName('shop')
            .setDescription('Place a shop')
            .addStringOption((o) => o.setName('id').setDescription('Entity id').setRequired(true))
            .addStringOption((o) => o.setName('name').setDescription('Shop name').setRequired(true))
            .addIntegerOption((o) => o.setName('row').setDescription('Row').setMinValue(0).setRequired(true))
            .addIntegerOption((o) => o.setName('col').setDescription('Column').setMinValue(0).setRequired(true))
            .addStringOption((o) => o.setName('greeting').setDescription('What the shopkeeper says'))
            .addStringOption((o) => o.setName('glyph').setDescription('Map emoji (default 🏪)')),
        )
        .addSubcommand((s) =>
          s
            .setName('pc')
            .setDescription("Place a player's character at a position")
            .addUserOption((o) => o.setName('user').setDescription('Player').setRequired(true))
            .addIntegerOption((o) => o.setName('row').setDescription('Row').setMinValue(0).setRequired(true))
            .addIntegerOption((o) => o.setName('col').setDescription('Column').setMinValue(0).setRequired(true)),
        ),
    )
    .addSubcommandGroup((g) =>
      g
        .setName('shop')
        .setDescription('Manage shop inventory')
        .addSubcommand((s) =>
          s
            .setName('add')
            .setDescription('Add an item to a shop')
            .addStringOption((o) => o.setName('id').setDescription('Shop entity id').setRequired(true))
            .addStringOption((o) => o.setName('item').setDescription('Item name').setRequired(true))
            .addIntegerOption((o) => o.setName('price').setDescription('Sale price (coins)').setMinValue(1).setRequired(true))
            .addIntegerOption((o) => o.setName('qty').setDescription('Stock (omit for unlimited)').setMinValue(1)),
        )
        .addSubcommand((s) =>
          s
            .setName('remove')
            .setDescription('Remove an item from a shop')
            .addStringOption((o) => o.setName('id').setDescription('Shop entity id').setRequired(true))
            .addStringOption((o) => o.setName('item').setDescription('Item name').setRequired(true)),
        ),
    )
    .addSubcommandGroup((g) =>
      g
        .setName('encounter')
        .setDescription('Combat encounter controls')
        .addSubcommand((s) =>
          s
            .setName('start')
            .setDescription('Start an encounter — rolls initiative')
            .addStringOption((o) => o.setName('label').setDescription('Label for the encounter').setRequired(true))
            .addStringOption((o) =>
              o.setName('entities').setDescription('Comma-separated entity ids in combat').setRequired(true),
            ),
        )
        .addSubcommand((s) => s.setName('end').setDescription('End the current encounter')),
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Remove an entity from the world')
        .addStringOption((o) => o.setName('entity').setDescription('Entity id').setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('narrate')
        .setDescription('Post DM narration')
        .addStringOption((o) => o.setName('text').setDescription('Narration text').setRequired(true)),
    ),
  async execute(interaction) {
    const group = interaction.options.getSubcommandGroup(false);
    const sub = interaction.options.getSubcommand(true);
    const guildId = interaction.guildId;
    if (!interaction.inCachedGuild() || !guildId) {
      await interaction.reply({ content: 'Use this in a server.', ephemeral: true });
      return;
    }

    if (group === 'world' && sub === 'init') {
      const existing = await loadWorld(guildId);
      if (existing) {
        await interaction.reply({ content: `World **${existing.name}** already exists.`, ephemeral: true });
        return;
      }
      const name = interaction.options.getString('name', true);
      const width = interaction.options.getInteger('width') ?? 100;
      const height = interaction.options.getInteger('height') ?? 100;
      await createWorld(guildId, interaction.user.id, name, width, height);
      await interaction.reply(`🌍 Created world **${name}** (${width}×${height}). You are the DM.`);
      return;
    }

    const world = await requireDm(interaction);
    if (!world) return;

    if (group === 'world' && sub === 'rename') {
      const name = interaction.options.getString('name', true);
      await updateWorld(guildId, (w) => { w.name = name; });
      await interaction.reply(`Renamed world to **${name}**.`);
      return;
    }

    if (group === 'world' && sub === 'spawn') {
      const row = interaction.options.getInteger('row', true);
      const col = interaction.options.getInteger('col', true);
      if (!inBounds(world, row, col)) {
        await interaction.reply({ content: 'Out of bounds.', ephemeral: true });
        return;
      }
      await updateWorld(guildId, (w) => { w.story.flags.spawn = [row, col]; });
      await interaction.reply(`📍 Spawn set to (${row},${col}).`);
      return;
    }

    if (group === 'world' && sub === 'info') {
      const charCount = Object.keys(world.characters).length;
      const zoneCount = Object.keys(world.zones).length;
      const entityCount = Object.keys(world.entities).length;
      const embed = new EmbedBuilder()
        .setTitle(`🌍 ${world.name}`)
        .setColor(0x3498db)
        .addFields(
          { name: 'DM', value: `<@${world.dmUserId}>`, inline: true },
          { name: 'Updated', value: world.updatedAt, inline: true },
          { name: 'Overworld', value: `${world.overworld.width}×${world.overworld.height}`, inline: true },
          { name: 'Characters', value: `${charCount}`, inline: true },
          { name: 'Zones', value: `${zoneCount}`, inline: true },
          { name: 'Entities', value: `${entityCount}`, inline: true },
          { name: 'Encounter', value: world.encounter ? `active: ${world.encounter.label}` : 'none', inline: true },
        );
      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (group === 'zone' && sub === 'create') {
      const id = interaction.options.getString('id', true);
      const name = interaction.options.getString('name', true);
      const row = interaction.options.getInteger('row', true);
      const col = interaction.options.getInteger('col', true);
      const width = interaction.options.getInteger('width', true);
      const height = interaction.options.getInteger('height', true);
      const description = interaction.options.getString('description') ?? '';
      if (world.zones[id]) {
        await interaction.reply({ content: `Zone \`${id}\` already exists.`, ephemeral: true });
        return;
      }
      if (!inBounds(world, row, col) || !inBounds(world, row + height - 1, col + width - 1)) {
        await interaction.reply({ content: 'Zone bounds fall outside the overworld.', ephemeral: true });
        return;
      }
      const zone: Zone = { name, description, bounds: { row, col, width, height } };
      await updateWorld(guildId, (w) => { w.zones[id] = zone; });
      await interaction.reply(`Defined zone \`${id}\` — **${name}** at (${row},${col}) ${width}×${height}.`);
      return;
    }

    if (group === 'zone' && sub === 'list') {
      const lines = Object.entries(world.zones).map(([id, z]) =>
        `• \`${id}\` — **${z.name}** at (${z.bounds.row},${z.bounds.col}) ${z.bounds.width}×${z.bounds.height}`,
      );
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle(`🗂️ Zones in ${world.name}`)
            .setColor(0x16a085)
            .setDescription(lines.length ? lines.join('\n') : '*No zones yet.*'),
        ],
      });
      return;
    }

    if (group === 'zone' && sub === 'delete') {
      const id = interaction.options.getString('id', true);
      if (!world.zones[id]) {
        await interaction.reply({ content: `No zone \`${id}\`.`, ephemeral: true });
        return;
      }
      await updateWorld(guildId, (w) => { delete w.zones[id]; });
      await interaction.reply(`Deleted zone label \`${id}\`.`);
      return;
    }

    if (group === 'paint' && sub === 'cell') {
      const row = interaction.options.getInteger('row', true);
      const col = interaction.options.getInteger('col', true);
      const token = interaction.options.getString('token', true);
      if (!validToken(token)) {
        await interaction.reply({ content: `Invalid token \`${token}\`.`, ephemeral: true });
        return;
      }
      if (!inBounds(world, row, col)) {
        await interaction.reply({ content: 'Out of bounds.', ephemeral: true });
        return;
      }
      await updateWorld(guildId, (w) => { setTerrain(w, row, col, token); });
      await interaction.reply({ content: `Painted (${row},${col}) → \`${token}\`.`, ephemeral: true });
      return;
    }

    if (group === 'paint' && sub === 'rect') {
      const row = interaction.options.getInteger('row', true);
      const col = interaction.options.getInteger('col', true);
      const width = interaction.options.getInteger('width', true);
      const height = interaction.options.getInteger('height', true);
      const token = interaction.options.getString('token', true);
      if (!validToken(token)) {
        await interaction.reply({ content: `Invalid token \`${token}\`.`, ephemeral: true });
        return;
      }
      let painted = 0;
      await updateWorld(guildId, (w) => { painted = paintRect(w, row, col, width, height, token); });
      await interaction.reply({ content: `Painted ${painted} cells with \`${token}\`.`, ephemeral: true });
      return;
    }

    if (group === 'paint' && sub === 'line') {
      const fr = interaction.options.getInteger('from-row', true);
      const fc = interaction.options.getInteger('from-col', true);
      const tr = interaction.options.getInteger('to-row', true);
      const tc = interaction.options.getInteger('to-col', true);
      const token = interaction.options.getString('token') ?? '=';
      if (!validToken(token)) {
        await interaction.reply({ content: `Invalid token \`${token}\`.`, ephemeral: true });
        return;
      }
      let painted = 0;
      await updateWorld(guildId, (w) => { painted = paintLine(w, [fr, fc], [tr, tc], token); });
      await interaction.reply({ content: `Painted ${painted} cells with \`${token}\`.`, ephemeral: true });
      return;
    }

    if (group === 'place' && sub === 'monster') {
      const id = interaction.options.getString('id', true);
      const srd = interaction.options.getString('srd', true);
      const row = interaction.options.getInteger('row', true);
      const col = interaction.options.getInteger('col', true);
      const displayName = interaction.options.getString('name');
      const glyph = interaction.options.getString('glyph') ?? undefined;
      if (world.entities[id]) {
        await interaction.reply({ content: `Entity \`${id}\` already exists.`, ephemeral: true });
        return;
      }
      if (!inBounds(world, row, col)) {
        await interaction.reply({ content: 'Out of bounds.', ephemeral: true });
        return;
      }
      await interaction.deferReply();
      const data = await lookup<MonsterData>('monsters', srd);
      if (!data) {
        await interaction.editReply(`SRD monster \`${srd}\` not found.`);
        return;
      }
      const ac = data.armor_class[0]?.value ?? 10;
      const entity: MonsterEntity = {
        kind: 'monster',
        name: displayName ?? data.name,
        glyph,
        pos: [row, col],
        hp: { current: data.hit_points, max: data.hit_points },
        ac,
        conditions: [],
        statBlock: srdToStatBlock(data),
        aiControlled: true,
        srdSlug: srd.toLowerCase().trim(),
      };
      await updateWorld(guildId, (w) => { w.entities[id] = entity; });
      await interaction.editReply(`Placed **${entity.name}** as \`${id}\` at (${row},${col}). HP ${entity.hp.max}, AC ${ac}.`);
      return;
    }

    if (group === 'place' && sub === 'npc') {
      const id = interaction.options.getString('id', true);
      const name = interaction.options.getString('name', true);
      const row = interaction.options.getInteger('row', true);
      const col = interaction.options.getInteger('col', true);
      const dialogue = interaction.options.getString('dialogue') ?? '';
      const glyph = interaction.options.getString('glyph') ?? undefined;
      if (world.entities[id]) {
        await interaction.reply({ content: `Entity \`${id}\` already exists.`, ephemeral: true });
        return;
      }
      if (!inBounds(world, row, col)) {
        await interaction.reply({ content: 'Out of bounds.', ephemeral: true });
        return;
      }
      const entity: NpcEntity = { kind: 'npc', name, glyph, pos: [row, col], dialogue };
      await updateWorld(guildId, (w) => { w.entities[id] = entity; });
      await interaction.reply(`Placed NPC **${name}** as \`${id}\` at (${row},${col}).`);
      return;
    }

    if (group === 'place' && sub === 'shop') {
      const id = interaction.options.getString('id', true);
      const name = interaction.options.getString('name', true);
      const row = interaction.options.getInteger('row', true);
      const col = interaction.options.getInteger('col', true);
      const greeting = interaction.options.getString('greeting') ?? 'Welcome, traveller. Browse my wares.';
      const glyph = interaction.options.getString('glyph') ?? '🏪';
      if (world.entities[id]) {
        await interaction.reply({ content: `Entity \`${id}\` already exists.`, ephemeral: true });
        return;
      }
      if (!inBounds(world, row, col)) {
        await interaction.reply({ content: 'Out of bounds.', ephemeral: true });
        return;
      }
      const entity: ShopEntity = { kind: 'shop', name, glyph, pos: [row, col], greeting, inventory: [] };
      await updateWorld(guildId, (w) => { w.entities[id] = entity; });
      await interaction.reply(`Placed shop **${name}** as \`${id}\` at (${row},${col}). Add items with \`/dm shop add\`.`);
      return;
    }

    if (group === 'place' && sub === 'pc') {
      const user = interaction.options.getUser('user', true);
      const row = interaction.options.getInteger('row', true);
      const col = interaction.options.getInteger('col', true);
      if (!world.characters[user.id]) {
        await interaction.reply({ content: `${user.toString()} has no character in this world.`, ephemeral: true });
        return;
      }
      if (!inBounds(world, row, col)) {
        await interaction.reply({ content: 'Out of bounds.', ephemeral: true });
        return;
      }
      const eid = `pc-${user.id}`;
      await updateWorld(guildId, (w) => {
        w.entities[eid] = { kind: 'pc', characterId: user.id, pos: [row, col] };
      });
      await interaction.reply(`Placed ${user.toString()}'s character at (${row},${col}).`);
      return;
    }

    if (group === 'shop' && sub === 'add') {
      const id = interaction.options.getString('id', true);
      const item = interaction.options.getString('item', true);
      const price = interaction.options.getInteger('price', true);
      const qty = interaction.options.getInteger('qty') ?? undefined;
      const shop = world.entities[id];
      if (!shop || shop.kind !== 'shop') {
        await interaction.reply({ content: `\`${id}\` is not a shop.`, ephemeral: true });
        return;
      }
      await updateWorld(guildId, (w) => {
        const s = w.entities[id] as ShopEntity;
        const idx = s.inventory.findIndex((i) => i.item === item);
        if (idx === -1) s.inventory.push({ item, price, qty });
        else s.inventory[idx] = { item, price, qty };
      });
      await interaction.reply(`Added **${item}** @ ${price} coins${qty != null ? ` (×${qty})` : ' (unlimited)'} to \`${id}\`.`);
      return;
    }

    if (group === 'shop' && sub === 'remove') {
      const id = interaction.options.getString('id', true);
      const item = interaction.options.getString('item', true);
      const shop = world.entities[id];
      if (!shop || shop.kind !== 'shop') {
        await interaction.reply({ content: `\`${id}\` is not a shop.`, ephemeral: true });
        return;
      }
      await updateWorld(guildId, (w) => {
        const s = w.entities[id] as ShopEntity;
        const idx = s.inventory.findIndex((i) => i.item === item);
        if (idx !== -1) s.inventory.splice(idx, 1);
      });
      await interaction.reply(`Removed **${item}** from \`${id}\`.`);
      return;
    }

    if (group === 'encounter' && sub === 'start') {
      if (world.encounter) {
        await interaction.reply({ content: 'An encounter is already active. End it first.', ephemeral: true });
        return;
      }
      const label = interaction.options.getString('label', true);
      const ids = interaction.options.getString('entities', true).split(',').map((s) => s.trim()).filter(Boolean);
      const missing = ids.filter((id) => !world.entities[id]);
      if (missing.length) {
        await interaction.reply({ content: `Unknown entities: ${missing.join(', ')}`, ephemeral: true });
        return;
      }
      const rolled = ids.map((id) => ({ entityId: id, initiative: rollInitiative(world, id) }));
      rolled.sort((a, b) => b.initiative - a.initiative);
      const budget: Record<string, number> = {};
      for (const id of ids) budget[id] = speedOf(world, id);
      await updateWorld(guildId, (w) => {
        w.encounter = {
          label,
          round: 1,
          turnIndex: 0,
          order: rolled,
          movementBudget: budget,
          log: [{ round: 1, actor: 'dm', action: `Encounter started: ${label}`, rolls: [] }],
        };
      });
      const orderText = rolled
        .map((r, i) => {
          const e = world.entities[r.entityId];
          const kind = e?.kind === 'pc' ? 'PC' : e?.kind === 'monster' ? e.name : e?.kind === 'npc' ? 'NPC' : '?';
          return `${i === 0 ? '➡️ ' : '   '}**${r.initiative}** — ${kind} (\`${r.entityId}\`)`;
        })
        .join('\n');
      const startEmbed = new EmbedBuilder()
        .setTitle('⚔️ Encounter started')
        .setColor(0xc0392b)
        .setDescription(orderText)
        .setFooter({ text: `Round 1 • ${label}` });

      await interaction.deferReply();
      const embeds: EmbedBuilder[] = [startEmbed];
      for (let i = 0; i < 20; i++) {
        const fresh = await loadWorld(guildId);
        const enc = fresh?.encounter;
        if (!enc) break;
        const actorId = currentActor(enc);
        if (!actorId) break;
        const actor = fresh!.entities[actorId];
        if (!actor || actor.kind !== 'monster' || !actor.aiControlled) break;

        let flavor = '';
        let lines: string[] = [];
        await updateWorld(guildId, (w) => {
          const report = runMonsterTurn(w, actorId);
          flavor = report.flavor;
          lines = report.lines;
          logAction(w.encounter!, actorId, 'AI ended turn');
          advanceTurn(w.encounter!);
          const next = currentActor(w.encounter!);
          if (next) w.encounter!.movementBudget[next] = speedOf(w, next);
        });
        embeds.push(
          new EmbedBuilder()
            .setTitle(`🤖 ${actor.name}'s turn`)
            .setColor(0x8e44ad)
            .setDescription([flavor, '', ...lines].filter(Boolean).join('\n')),
        );
      }
      await interaction.editReply({ embeds: embeds.slice(0, 10) });
      return;
    }

    if (group === 'encounter' && sub === 'end') {
      if (!world.encounter) {
        await interaction.reply({ content: 'No encounter is active.', ephemeral: true });
        return;
      }
      await updateWorld(guildId, (w) => { w.encounter = null; });
      await interaction.reply('🕊️ Encounter ended.');
      return;
    }

    if (!group && sub === 'remove') {
      const eid = interaction.options.getString('entity', true);
      if (!world.entities[eid]) {
        await interaction.reply({ content: `No entity \`${eid}\`.`, ephemeral: true });
        return;
      }
      await updateWorld(guildId, (w) => { delete w.entities[eid]; });
      await interaction.reply(`Removed entity \`${eid}\`.`);
      return;
    }

    if (!group && sub === 'narrate') {
      const text = interaction.options.getString('text', true);
      const embed = new EmbedBuilder()
        .setColor(0x8e44ad)
        .setAuthor({ name: `${interaction.user.username} (DM)` })
        .setDescription(text);
      await interaction.reply({ embeds: [embed] });
      return;
    }
  },
};
