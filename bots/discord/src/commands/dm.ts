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

function emptyGrid(width: number, height: number): string[] {
  return Array.from({ length: height }, () => '.'.repeat(width));
}

function setCell(grid: string[], row: number, col: number, token: string): string[] {
  const line = grid[row];
  return [
    ...grid.slice(0, row),
    line.slice(0, col) + token + line.slice(col + 1),
    ...grid.slice(row + 1),
  ];
}

function validToken(token: string): boolean {
  return /^[.#~+><]$/.test(token);
}

function renderZone(zone: Zone, entities: World['entities']): string {
  const overlay = zone.grid.map((row) => row.split(''));
  for (const [eid, e] of Object.entries(entities)) {
    if (e.zone !== zoneIdFor(zone, entities)) continue;
    const [r, c] = e.pos;
    if (r >= 0 && r < overlay.length && c >= 0 && c < overlay[r].length) {
      overlay[r][c] = letterFor(e, eid);
    }
  }
  return overlay.map((row) => row.join('')).join('\n');
}

function zoneIdFor(zone: Zone, entities: World['entities']): string {
  // Find the zone's id by matching the zone object reference; used by render.
  for (const e of Object.values(entities)) if (e.zone === (zone as unknown as { _id?: string })._id) return e.zone;
  return '';
}

function letterFor(entity: World['entities'][string], id: string): string {
  if (entity.kind === 'pc') return id[0]?.toUpperCase() ?? '?';
  if (entity.kind === 'npc') return '@';
  return entity.name[0]?.toLowerCase() ?? '?';
}

function renderZoneById(world: World, zoneId: string): string {
  const zone = world.zones[zoneId];
  if (!zone) return '(no such zone)';
  const overlay = zone.grid.map((row) => row.split(''));
  for (const [eid, e] of Object.entries(world.entities)) {
    if (e.zone !== zoneId) continue;
    const [r, c] = e.pos;
    if (r >= 0 && r < overlay.length && c >= 0 && c < overlay[r].length) {
      overlay[r][c] = letterFor(e, eid);
    }
  }
  return overlay.map((row) => row.join('')).join('\n');
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
            .addStringOption((o) => o.setName('name').setDescription('World name').setRequired(true)),
        )
        .addSubcommand((s) =>
          s
            .setName('rename')
            .setDescription('Rename the world')
            .addStringOption((o) => o.setName('name').setDescription('New name').setRequired(true)),
        )
        .addSubcommand((s) => s.setName('info').setDescription('Show world summary')),
    )
    .addSubcommandGroup((g) =>
      g
        .setName('zone')
        .setDescription('Zone (map) commands')
        .addSubcommand((s) =>
          s
            .setName('create')
            .setDescription('Create a new zone')
            .addStringOption((o) => o.setName('id').setDescription('Zone id (kebab-case)').setRequired(true))
            .addStringOption((o) => o.setName('name').setDescription('Display name').setRequired(true))
            .addIntegerOption((o) => o.setName('width').setDescription('Width (cells)').setMinValue(3).setMaxValue(40).setRequired(true))
            .addIntegerOption((o) => o.setName('height').setDescription('Height (cells)').setMinValue(3).setMaxValue(40).setRequired(true))
            .addStringOption((o) => o.setName('description').setDescription('Short description')),
        )
        .addSubcommand((s) =>
          s
            .setName('paint')
            .setDescription('Set a single cell')
            .addStringOption((o) => o.setName('id').setDescription('Zone id').setRequired(true))
            .addIntegerOption((o) => o.setName('row').setDescription('Row (0-indexed)').setMinValue(0).setRequired(true))
            .addIntegerOption((o) => o.setName('col').setDescription('Column (0-indexed)').setMinValue(0).setRequired(true))
            .addStringOption((o) =>
              o.setName('token').setDescription('Cell token').setRequired(true).addChoices(
                { name: '. floor', value: '.' },
                { name: '# wall', value: '#' },
                { name: '~ difficult', value: '~' },
                { name: '+ door', value: '+' },
                { name: '> stairs down', value: '>' },
                { name: '< stairs up', value: '<' },
              ),
            ),
        )
        .addSubcommand((s) =>
          s
            .setName('show')
            .setDescription('Render a zone')
            .addStringOption((o) => o.setName('id').setDescription('Zone id').setRequired(true)),
        ),
    )
    .addSubcommandGroup((g) =>
      g
        .setName('place')
        .setDescription('Place entities on a zone')
        .addSubcommand((s) =>
          s
            .setName('monster')
            .setDescription('Place a monster (SRD stat block inlined)')
            .addStringOption((o) => o.setName('id').setDescription('Entity id (e.g. goblin-1)').setRequired(true))
            .addStringOption((o) => o.setName('srd').setDescription('SRD monster name (e.g. goblin)').setRequired(true))
            .addStringOption((o) => o.setName('zone').setDescription('Zone id').setRequired(true))
            .addIntegerOption((o) => o.setName('row').setDescription('Row').setMinValue(0).setRequired(true))
            .addIntegerOption((o) => o.setName('col').setDescription('Column').setMinValue(0).setRequired(true))
            .addStringOption((o) => o.setName('name').setDescription('Display name (default: SRD name)')),
        )
        .addSubcommand((s) =>
          s
            .setName('npc')
            .setDescription('Place an NPC')
            .addStringOption((o) => o.setName('id').setDescription('Entity id').setRequired(true))
            .addStringOption((o) => o.setName('name').setDescription('Display name').setRequired(true))
            .addStringOption((o) => o.setName('zone').setDescription('Zone id').setRequired(true))
            .addIntegerOption((o) => o.setName('row').setDescription('Row').setMinValue(0).setRequired(true))
            .addIntegerOption((o) => o.setName('col').setDescription('Column').setMinValue(0).setRequired(true))
            .addStringOption((o) => o.setName('dialogue').setDescription('Initial dialogue line')),
        )
        .addSubcommand((s) =>
          s
            .setName('pc')
            .setDescription("Place a player's character into a zone")
            .addUserOption((o) => o.setName('user').setDescription('Player').setRequired(true))
            .addStringOption((o) => o.setName('zone').setDescription('Zone id').setRequired(true))
            .addIntegerOption((o) => o.setName('row').setDescription('Row').setMinValue(0).setRequired(true))
            .addIntegerOption((o) => o.setName('col').setDescription('Column').setMinValue(0).setRequired(true)),
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
            .addStringOption((o) => o.setName('zone').setDescription('Zone id').setRequired(true))
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
      await createWorld(guildId, interaction.user.id, name);
      await interaction.reply(`🌍 Created world **${name}**. You are the DM.`);
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
          { name: 'Characters', value: `${charCount}`, inline: true },
          { name: 'Zones', value: `${zoneCount}`, inline: true },
          { name: 'Entities', value: `${entityCount}`, inline: true },
          { name: 'Encounter', value: world.encounter ? `active in ${world.encounter.zone}` : 'none', inline: true },
        );
      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (group === 'zone' && sub === 'create') {
      const id = interaction.options.getString('id', true);
      const name = interaction.options.getString('name', true);
      const width = interaction.options.getInteger('width', true);
      const height = interaction.options.getInteger('height', true);
      const description = interaction.options.getString('description') ?? '';
      if (world.zones[id]) {
        await interaction.reply({ content: `Zone \`${id}\` already exists.`, ephemeral: true });
        return;
      }
      await updateWorld(guildId, (w) => {
        w.zones[id] = {
          name, width, height,
          grid: emptyGrid(width, height),
          description,
          exits: {},
        };
      });
      await interaction.reply(`Created zone \`${id}\` (${width}×${height}).`);
      return;
    }

    if (group === 'zone' && sub === 'paint') {
      const id = interaction.options.getString('id', true);
      const row = interaction.options.getInteger('row', true);
      const col = interaction.options.getInteger('col', true);
      const token = interaction.options.getString('token', true);
      if (!validToken(token)) {
        await interaction.reply({ content: `Invalid token \`${token}\`.`, ephemeral: true });
        return;
      }
      const zone = world.zones[id];
      if (!zone) {
        await interaction.reply({ content: `Zone \`${id}\` not found.`, ephemeral: true });
        return;
      }
      if (row >= zone.height || col >= zone.width) {
        await interaction.reply({ content: 'Out of bounds.', ephemeral: true });
        return;
      }
      await updateWorld(guildId, (w) => {
        w.zones[id].grid = setCell(w.zones[id].grid, row, col, token);
      });
      await interaction.reply({ content: `Painted (${row},${col}) → \`${token}\`.`, ephemeral: true });
      return;
    }

    if (group === 'zone' && sub === 'show') {
      const id = interaction.options.getString('id', true);
      const zone = world.zones[id];
      if (!zone) {
        await interaction.reply({ content: `Zone \`${id}\` not found.`, ephemeral: true });
        return;
      }
      const rendered = renderZoneById(world, id);
      const embed = new EmbedBuilder()
        .setTitle(`🗺️ ${zone.name}`)
        .setColor(0x16a085)
        .setDescription('```\n' + rendered + '\n```');
      if (zone.description) embed.addFields({ name: 'Description', value: zone.description });
      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (group === 'place' && sub === 'monster') {
      const id = interaction.options.getString('id', true);
      const srd = interaction.options.getString('srd', true);
      const zoneId = interaction.options.getString('zone', true);
      const row = interaction.options.getInteger('row', true);
      const col = interaction.options.getInteger('col', true);
      const displayName = interaction.options.getString('name');
      if (world.entities[id]) {
        await interaction.reply({ content: `Entity \`${id}\` already exists.`, ephemeral: true });
        return;
      }
      if (!world.zones[zoneId]) {
        await interaction.reply({ content: `Zone \`${zoneId}\` not found.`, ephemeral: true });
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
        zone: zoneId,
        pos: [row, col],
        hp: { current: data.hit_points, max: data.hit_points },
        ac,
        conditions: [],
        statBlock: srdToStatBlock(data),
        aiControlled: true,
        srdSlug: srd.toLowerCase().trim(),
      };
      await updateWorld(guildId, (w) => { w.entities[id] = entity; });
      await interaction.editReply(`Placed **${entity.name}** as \`${id}\` at (${row},${col}) in \`${zoneId}\`. HP ${entity.hp.max}, AC ${ac}.`);
      return;
    }

    if (group === 'place' && sub === 'npc') {
      const id = interaction.options.getString('id', true);
      const name = interaction.options.getString('name', true);
      const zoneId = interaction.options.getString('zone', true);
      const row = interaction.options.getInteger('row', true);
      const col = interaction.options.getInteger('col', true);
      const dialogue = interaction.options.getString('dialogue') ?? '';
      if (world.entities[id]) {
        await interaction.reply({ content: `Entity \`${id}\` already exists.`, ephemeral: true });
        return;
      }
      if (!world.zones[zoneId]) {
        await interaction.reply({ content: `Zone \`${zoneId}\` not found.`, ephemeral: true });
        return;
      }
      const entity: NpcEntity = { kind: 'npc', name, zone: zoneId, pos: [row, col], dialogue };
      await updateWorld(guildId, (w) => { w.entities[id] = entity; });
      await interaction.reply(`Placed NPC **${name}** as \`${id}\` at (${row},${col}) in \`${zoneId}\`.`);
      return;
    }

    if (group === 'place' && sub === 'pc') {
      const user = interaction.options.getUser('user', true);
      const zoneId = interaction.options.getString('zone', true);
      const row = interaction.options.getInteger('row', true);
      const col = interaction.options.getInteger('col', true);
      if (!world.characters[user.id]) {
        await interaction.reply({ content: `${user.toString()} has no character in this world.`, ephemeral: true });
        return;
      }
      if (!world.zones[zoneId]) {
        await interaction.reply({ content: `Zone \`${zoneId}\` not found.`, ephemeral: true });
        return;
      }
      const eid = `pc-${user.id}`;
      await updateWorld(guildId, (w) => {
        w.entities[eid] = {
          kind: 'pc',
          characterId: user.id,
          zone: zoneId,
          pos: [row, col],
        };
      });
      await interaction.reply(`Placed ${user.toString()}'s character at (${row},${col}) in \`${zoneId}\`.`);
      return;
    }

    if (group === 'encounter' && sub === 'start') {
      if (world.encounter) {
        await interaction.reply({ content: 'An encounter is already active. End it first.', ephemeral: true });
        return;
      }
      const zoneId = interaction.options.getString('zone', true);
      const ids = interaction.options.getString('entities', true).split(',').map((s) => s.trim()).filter(Boolean);
      if (!world.zones[zoneId]) {
        await interaction.reply({ content: `Zone \`${zoneId}\` not found.`, ephemeral: true });
        return;
      }
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
          zone: zoneId,
          round: 1,
          turnIndex: 0,
          order: rolled,
          movementBudget: budget,
          log: [{ round: 1, actor: 'dm', action: `Encounter started in ${zoneId}`, rolls: [] }],
        };
      });
      const orderText = rolled
        .map((r, i) => `${i === 0 ? '➡️ ' : '   '}**${r.initiative}** — ${world.entities[r.entityId]?.kind === 'pc' ? 'PC' : world.entities[r.entityId]?.kind === 'monster' ? (world.entities[r.entityId] as { name: string }).name : 'NPC'} (\`${r.entityId}\`)`)
        .join('\n');
      const startEmbed = new EmbedBuilder()
        .setTitle('⚔️ Encounter started')
        .setColor(0xc0392b)
        .setDescription(orderText)
        .setFooter({ text: `Round 1 • Zone: ${zoneId}` });

      // Chain AI turns if the highest-initiative actor is AI-controlled.
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

// keep these referenced so unused imports are noted only if truly unused
void zoneIdFor;
void renderZone;
