import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
} from 'discord.js';
import { entityForUser } from '../dnd/encounter.ts';
import { Entity, loadWorld, World, zoneAt } from '../dnd/world.ts';
import type { Command } from './types.ts';

const TERRAIN_EMOJI: Record<string, string> = {
  '.': '🟫',
  '#': '⬛',
  '~': '🟦',
  f: '🌲',
  '^': '⛰️',
  '=': '🟧',
  '+': '🚪',
  '>': '🔽',
  '<': '🔼',
};
const UNKNOWN = '⬜';
const PC = '🧙';
const NPC = '🧑';
const MONSTER = '👹';
const SHOP = '🏪';

function entityEmoji(e: Entity, world: World): string {
  if (e.kind === 'pc') return world.characters[e.characterId]?.glyph ?? PC;
  if (e.glyph) return e.glyph;
  if (e.kind === 'npc') return NPC;
  if (e.kind === 'shop') return SHOP;
  return MONSTER;
}

function tokenEmoji(token: string): string {
  return TERRAIN_EMOJI[token] ?? UNKNOWN;
}

interface ViewportSpec {
  centerRow: number;
  centerCol: number;
  width: number;
  height: number;
}

function renderViewport(world: World, vp: ViewportSpec): string {
  const halfW = Math.floor(vp.width / 2);
  const halfH = Math.floor(vp.height / 2);
  const startR = vp.centerRow - halfH;
  const startC = vp.centerCol - halfW;

  // Index entities by cell for O(1) lookup.
  const cellEntities = new Map<string, Entity>();
  for (const e of Object.values(world.entities)) {
    cellEntities.set(`${e.pos[0]},${e.pos[1]}`, e);
  }

  const rows: string[] = [];
  for (let r = startR; r < startR + vp.height; r++) {
    let row = '';
    for (let c = startC; c < startC + vp.width; c++) {
      if (r < 0 || r >= world.overworld.height || c < 0 || c >= world.overworld.width) {
        row += '⬛';
        continue;
      }
      const ent = cellEntities.get(`${r},${c}`);
      if (ent) {
        row += entityEmoji(ent, world);
      } else {
        row += tokenEmoji(world.overworld.grid[r][c]);
      }
    }
    rows.push(row);
  }
  return rows.join('\n');
}

// Renders the full overworld downsampled to fit `targetSide` × `targetSide`
// cells. Picks the "most interesting" token in each block: entity > non-floor
// terrain > floor.
function renderOverview(world: World, targetSide: number): { text: string; scale: number } {
  const scale = Math.max(
    1,
    Math.ceil(Math.max(world.overworld.width, world.overworld.height) / targetSide),
  );
  const outRows = Math.ceil(world.overworld.height / scale);
  const outCols = Math.ceil(world.overworld.width / scale);

  // Pre-bucket entities by block.
  const blockEnts = new Map<string, Entity>();
  for (const e of Object.values(world.entities)) {
    const br = Math.floor(e.pos[0] / scale);
    const bc = Math.floor(e.pos[1] / scale);
    const key = `${br},${bc}`;
    // First entity wins; PCs/shops bias higher by overwriting monsters only if needed.
    const existing = blockEnts.get(key);
    if (!existing) blockEnts.set(key, e);
    else if (e.kind === 'pc' && existing.kind !== 'pc') blockEnts.set(key, e);
    else if (e.kind === 'shop' && existing.kind === 'monster') blockEnts.set(key, e);
  }

  const rows: string[] = [];
  for (let br = 0; br < outRows; br++) {
    let line = '';
    for (let bc = 0; bc < outCols; bc++) {
      const ent = blockEnts.get(`${br},${bc}`);
      if (ent) {
        line += entityEmoji(ent, world);
        continue;
      }
      // Dominant non-floor terrain in this block.
      let pick = '.';
      for (let r = br * scale; r < Math.min((br + 1) * scale, world.overworld.height); r++) {
        for (let c = bc * scale; c < Math.min((bc + 1) * scale, world.overworld.width); c++) {
          const t = world.overworld.grid[r][c];
          if (t !== '.' && t !== pick) {
            // priority order
            const priority = '#^~=f+><.';
            if (pick === '.' || priority.indexOf(t) < priority.indexOf(pick)) pick = t;
          }
        }
      }
      line += tokenEmoji(pick);
    }
    rows.push(line);
  }
  return { text: rows.join('\n'), scale };
}

export const map: Command = {
  data: new SlashCommandBuilder()
    .setName('map')
    .setDescription('Show the world map')
    .addSubcommand((s) =>
      s
        .setName('here')
        .setDescription('Show a viewport centred on you (default)')
        .addIntegerOption((o) => o.setName('radius').setDescription('Half-width of view (default 14)').setMinValue(4).setMaxValue(20)),
    )
    .addSubcommand((s) =>
      s
        .setName('at')
        .setDescription('Show a viewport centred on a coordinate')
        .addIntegerOption((o) => o.setName('row').setDescription('Center row').setMinValue(0).setRequired(true))
        .addIntegerOption((o) => o.setName('col').setDescription('Center col').setMinValue(0).setRequired(true))
        .addIntegerOption((o) => o.setName('radius').setDescription('Half-width of view (default 14)').setMinValue(4).setMaxValue(20)),
    )
    .addSubcommand((s) =>
      s.setName('world').setDescription('Show the whole overworld, downsampled'),
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inCachedGuild()) {
      await interaction.reply({ content: 'Use this in a server.', ephemeral: true });
      return;
    }
    const world = await loadWorld(interaction.guildId!);
    if (!world) {
      await interaction.reply({ content: 'No world here yet.', ephemeral: true });
      return;
    }
    const sub = interaction.options.getSubcommand(false) ?? 'here';

    if (sub === 'world') {
      const { text, scale } = renderOverview(world, 25);
      const embed = new EmbedBuilder()
        .setTitle(`🌍 ${world.name} — overview`)
        .setColor(0x16a085)
        .setDescription(text)
        .setFooter({ text: `${world.overworld.width}×${world.overworld.height} overworld, 1 tile = ${scale}×${scale} cells` });
      const openQuests = world.story.questLog.filter((q) => !q.done);
      if (openQuests.length) {
        embed.addFields({ name: 'Open quests', value: openQuests.map((q) => `• ${q.title}`).join('\n') });
      }
      await interaction.reply({ embeds: [embed] });
      return;
    }

    let centerRow: number;
    let centerCol: number;
    let radius = interaction.options.getInteger('radius') ?? 14;

    if (sub === 'at') {
      centerRow = interaction.options.getInteger('row', true);
      centerCol = interaction.options.getInteger('col', true);
    } else {
      const owner = entityForUser(world, interaction.user.id);
      if (!owner) {
        await interaction.reply({
          content: 'You have no character placed. Use `/map world` or `/map at row: col:`.',
          ephemeral: true,
        });
        return;
      }
      centerRow = owner.entity.pos[0];
      centerCol = owner.entity.pos[1];
    }

    const text = renderViewport(world, {
      centerRow,
      centerCol,
      width: radius * 2 + 1,
      height: Math.floor(radius * 1.3) + 1,
    });
    const zone = zoneAt(world, centerRow, centerCol);
    const nearbyEntities = Object.entries(world.entities)
      .filter(([, e]) => Math.max(Math.abs(e.pos[0] - centerRow), Math.abs(e.pos[1] - centerCol)) <= radius)
      .map(([eid, e]) => {
        const emoji = entityEmoji(e, world);
        const label =
          e.kind === 'pc'
            ? (world.characters[e.characterId]?.name ?? eid) + ' (PC)'
            : e.kind === 'monster'
              ? `${e.name} — HP ${e.hp.current}/${e.hp.max}`
              : e.kind === 'shop'
                ? `${e.name} (shop)`
                : `${e.name} (NPC)`;
        return `${emoji} \`${eid}\` ${label} @ (${e.pos[0]},${e.pos[1]})`;
      });

    const embed = new EmbedBuilder()
      .setTitle(`🗺️ ${zone ? zone.zone.name : world.name}`)
      .setColor(0x16a085)
      .setDescription(text)
      .setFooter({ text: `Center (${centerRow},${centerCol}) • view ${radius * 2 + 1}×${Math.floor(radius * 1.3) + 1}` });
    if (zone?.zone.description) embed.addFields({ name: 'Where you stand', value: zone.zone.description });
    if (nearbyEntities.length) embed.addFields({ name: 'Visible', value: nearbyEntities.slice(0, 20).join('\n') });
    const legend = [
      `${TERRAIN_EMOJI['.']} ground`,
      `${TERRAIN_EMOJI['=']} road`,
      `${TERRAIN_EMOJI['f']} forest`,
      `${TERRAIN_EMOJI['~']} water`,
      `${TERRAIN_EMOJI['^']} mountain`,
      `${TERRAIN_EMOJI['#']} wall`,
      `${TERRAIN_EMOJI['+']} door`,
      `${PC} PC ${NPC} NPC ${MONSTER} monster ${SHOP} shop`,
    ].join(' • ');
    embed.addFields({ name: 'Legend', value: legend });
    await interaction.reply({ embeds: [embed] });
  },
};
