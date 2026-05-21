import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
} from 'discord.js';
import type { Command } from './types.ts';
import {
  Character,
  MOB_KINDS,
  Mob,
  World,
  cheby,
  entityAt,
  findOpenCell,
  getOrCreateWorld,
  isWalkable,
  lootAt,
  terrainAt,
  updateWorld,
  xpToNext,
} from '../rpg/world.ts';
import { tickWorld } from '../rpg/tick.ts';
import { renderViewport, listNearby, legend } from '../rpg/render.ts';
import {
  attackCooldownRemainingMs,
  ATTACK_COOLDOWN_MS,
  charAttackMob,
} from '../rpg/combat.ts';

const PC_GLYPHS = ['🧙', '🧝', '🧛', '🧟', '🧞', '🧜', '🦸', '🥷', '👤', '🧚'];

type Dir = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

const DIR_VEC: Record<Dir, [number, number]> = {
  n: [-1, 0],
  s: [1, 0],
  e: [0, 1],
  w: [0, -1],
  ne: [-1, 1],
  nw: [-1, -1],
  se: [1, 1],
  sw: [1, -1],
};

function pickGlyph(world: World): string {
  const taken = new Set(Object.values(world.chars).map((c) => c.glyph));
  for (const g of PC_GLYPHS) if (!taken.has(g)) return g;
  return PC_GLYPHS[Math.floor(Math.random() * PC_GLYPHS.length)];
}

function fmtCooldown(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

function tickEventsText(world: World, events: ReturnType<typeof tickWorld>): string | null {
  if (events.length === 0) return null;
  return events.map((e) => `• ${e.log}`).join('\n');
}

const data = new SlashCommandBuilder()
  .setName('rpg')
  .setDescription('Drop-in multiplayer RPG: explore, fight, loot, level up')
  .addSubcommand((s) =>
    s.setName('join').setDescription('Create your character and enter the world')
      .addStringOption((o) => o.setName('name').setDescription('Character name (defaults to your Discord name)').setMaxLength(24))
      .addStringOption((o) => o.setName('glyph').setDescription('Single emoji to represent you').setMaxLength(8)),
  )
  .addSubcommand((s) => s.setName('me').setDescription('Show your character sheet'))
  .addSubcommand((s) =>
    s.setName('move').setDescription('Step in a direction')
      .addStringOption((o) =>
        o.setName('dir').setDescription('Direction').setRequired(true).addChoices(
          { name: 'north', value: 'n' },
          { name: 'south', value: 's' },
          { name: 'east', value: 'e' },
          { name: 'west', value: 'w' },
          { name: 'northeast', value: 'ne' },
          { name: 'northwest', value: 'nw' },
          { name: 'southeast', value: 'se' },
          { name: 'southwest', value: 'sw' },
        ),
      ),
  )
  .addSubcommand((s) => s.setName('look').setDescription('What is nearby'))
  .addSubcommand((s) => s.setName('attack').setDescription('Attack the nearest adjacent enemy'))
  .addSubcommand((s) => s.setName('pickup').setDescription('Pick up loot on your tile'))
  .addSubcommand((s) => s.setName('use').setDescription('Use a healing potion from your inventory'))
  .addSubcommand((s) => s.setName('map').setDescription('Show the map around you'))
  .addSubcommand((s) => s.setName('top').setDescription('Leaderboard of adventurers'))
  .addSubcommand((s) => s.setName('leave').setDescription('Remove your character from this world'));

export const rpg: Command = {
  data,
  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inCachedGuild()) {
      await interaction.reply({ content: 'Use this in a server.', ephemeral: true });
      return;
    }
    const sub = interaction.options.getSubcommand();
    const userId = interaction.user.id;
    const displayName = interaction.user.username;

    switch (sub) {
      case 'join': return handleJoin(interaction, userId, displayName);
      case 'me': return handleMe(interaction, userId);
      case 'move': return handleMove(interaction, userId);
      case 'look': return handleLook(interaction, userId);
      case 'attack': return handleAttack(interaction, userId);
      case 'pickup': return handlePickup(interaction, userId);
      case 'use': return handleUse(interaction, userId);
      case 'map': return handleMap(interaction, userId);
      case 'top': return handleTop(interaction);
      case 'leave': return handleLeave(interaction, userId);
    }
  },
};

async function handleJoin(
  interaction: ChatInputCommandInteraction,
  userId: string,
  displayName: string,
): Promise<void> {
  const customName = interaction.options.getString('name');
  const customGlyph = interaction.options.getString('glyph');

  const world = await updateWorld(interaction.guildId!, (w) => {
    tickWorld(w);
    if (w.chars[userId]) return;
    const cell = findOpenCell(w, w.spawn, 6) ?? w.spawn;
    w.chars[userId] = {
      userId,
      name: customName?.trim() || displayName,
      glyph: (customGlyph?.match(/\p{Extended_Pictographic}/u)?.[0]) ?? pickGlyph(w),
      pos: cell,
      hp: 20,
      maxHp: 20,
      atk: 3,
      def: 1,
      level: 1,
      xp: 0,
      coins: 10,
      kills: 0,
      deaths: 0,
      inventory: [],
      lastAttackAt: 0,
      lastMoveAt: 0,
    };
  });

  const char = world.chars[userId];
  const embed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle(`${char.glyph} ${char.name} joins the adventure`)
    .setDescription(`Spawned at (${char.pos[0]}, ${char.pos[1]}). Use \`/rpg map\` to look around, \`/rpg move\` to explore.`)
    .addFields(
      { name: 'HP', value: `${char.hp}/${char.maxHp}`, inline: true },
      { name: 'ATK / DEF', value: `${char.atk} / ${char.def}`, inline: true },
      { name: 'Coins', value: `${char.coins}`, inline: true },
    );
  await interaction.reply({ embeds: [embed] });
}

async function handleMe(
  interaction: ChatInputCommandInteraction,
  userId: string,
): Promise<void> {
  const world = await getOrCreateWorld(interaction.guildId!);
  const char = world.chars[userId];
  if (!char) {
    await interaction.reply({ content: 'You have not joined. Use `/rpg join` first.', ephemeral: true });
    return;
  }
  const cooldownMs = attackCooldownRemainingMs(char);
  const embed = new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle(`${char.glyph} ${char.name}`)
    .setDescription(
      `Lvl **${char.level}** • ${char.xp} XP (next in ${xpToNext(char.xp)})`,
    )
    .addFields(
      { name: 'HP', value: `${char.hp}/${char.maxHp}`, inline: true },
      { name: 'ATK / DEF', value: `${char.atk} / ${char.def}`, inline: true },
      { name: 'Coins', value: `${char.coins}`, inline: true },
      { name: 'Kills / Deaths', value: `${char.kills} / ${char.deaths}`, inline: true },
      { name: 'Position', value: `(${char.pos[0]}, ${char.pos[1]})`, inline: true },
      { name: 'Cooldown', value: cooldownMs > 0 ? fmtCooldown(cooldownMs) : 'ready', inline: true },
      { name: 'Inventory', value: char.inventory.length ? char.inventory.join(', ') : '— empty —' },
    );
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleMove(
  interaction: ChatInputCommandInteraction,
  userId: string,
): Promise<void> {
  const dir = interaction.options.getString('dir', true) as Dir;
  const [dr, dc] = DIR_VEC[dir];

  let outcome: {
    char: Character | null;
    blocked: boolean;
    blockReason: string;
    pickedUp: string | null;
    tickEvents: string | null;
  } = {
    char: null,
    blocked: false,
    blockReason: '',
    pickedUp: null,
    tickEvents: null,
  };

  const world = await updateWorld(interaction.guildId!, (w) => {
    const events = tickWorld(w);
    const char = w.chars[userId];
    if (!char) return;
    if (char.hp <= 0) { outcome.blocked = true; outcome.blockReason = 'You are unconscious.'; return; }

    const nr = char.pos[0] + dr;
    const nc = char.pos[1] + dc;
    const token = terrainAt(w, nr, nc);
    if (!isWalkable(token)) {
      outcome.blocked = true;
      outcome.blockReason = token === '~' ? 'Water blocks your way.' : token === '^' ? 'A mountain blocks your way.' : 'A wall blocks your way.';
      return;
    }
    const ent = entityAt(w, nr, nc);
    if (ent) {
      outcome.blocked = true;
      const kind = 'kind' in ent && ent.kind in MOB_KINDS ? MOB_KINDS[(ent as { kind: string }).kind].name : 'someone';
      outcome.blockReason = `${kind} stands in your way. Try \`/rpg attack\`.`;
      return;
    }
    char.pos = [nr, nc];
    char.lastMoveAt = Date.now();

    // Auto-pickup loot on the tile we stepped onto.
    const loot = lootAt(w, nr, nc);
    if (loot) {
      const coinMatch = loot.item.match(/^(\d+)-coins$/);
      if (coinMatch) {
        const amt = parseInt(coinMatch[1], 10);
        char.coins += amt;
        outcome.pickedUp = `${amt} coins`;
      } else {
        char.inventory.push(loot.item);
        outcome.pickedUp = loot.item;
      }
      delete w.loot[loot.id];
    }

    outcome.char = char;
    outcome.tickEvents = tickEventsText(w, events);
  });

  if (outcome.blocked) {
    await interaction.reply({ content: outcome.blockReason, ephemeral: true });
    return;
  }
  if (!outcome.char) {
    await interaction.reply({ content: 'You have not joined. Use `/rpg join` first.', ephemeral: true });
    return;
  }

  const char = outcome.char;
  const lines: string[] = [
    `${char.glyph} **${char.name}** moves ${dirName(dir)} → (${char.pos[0]}, ${char.pos[1]})`,
  ];
  if (outcome.pickedUp) lines.push(`💰 Picked up **${outcome.pickedUp}**.`);
  if (outcome.tickEvents) lines.push('', outcome.tickEvents);

  const embed = new EmbedBuilder()
    .setColor(0x9b59b6)
    .setDescription(lines.join('\n') + '\n\n' + renderViewport(world, char.pos, 5));
  await interaction.reply({ embeds: [embed] });
}

async function handleLook(
  interaction: ChatInputCommandInteraction,
  userId: string,
): Promise<void> {
  const world = await updateWorld(interaction.guildId!, (w) => { tickWorld(w); });
  const char = world.chars[userId];
  if (!char) {
    await interaction.reply({ content: 'You have not joined. Use `/rpg join` first.', ephemeral: true });
    return;
  }
  const nearby = listNearby(world, char.pos, 7);
  const embed = new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle(`${char.glyph} ${char.name} looks around`)
    .setDescription(
      nearby.length
        ? nearby
            .slice(0, 12)
            .map((n) => `${n.emoji} ${n.label} — ${n.distance} away (${n.pos[0]}, ${n.pos[1]})`)
            .join('\n')
        : 'Nothing of note within view.',
    );
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleAttack(
  interaction: ChatInputCommandInteraction,
  userId: string,
): Promise<void> {
  let resultLines: string[] = [];
  let viewportPos: [number, number] | null = null;
  let viewportWorld: World | null = null;
  let cooldownMsg: string | null = null;
  let missing = false;

  const world = await updateWorld(interaction.guildId!, (w) => {
    tickWorld(w);
    const char = w.chars[userId];
    if (!char) { missing = true; return; }
    if (char.hp <= 0) { resultLines.push('You are unconscious.'); return; }

    const cooldownMs = attackCooldownRemainingMs(char);
    if (cooldownMs > 0) {
      cooldownMsg = `On cooldown — ${fmtCooldown(cooldownMs)} remaining (${(ATTACK_COOLDOWN_MS / 1000).toFixed(0)}s between swings).`;
      return;
    }

    const target = pickAdjacentMob(w, char);
    if (!target) {
      resultLines.push('Nothing adjacent to attack. Move closer to a target.');
      return;
    }

    const res = charAttackMob(w, char, target);
    if (!res) return;
    resultLines.push(res.attack.log);
    if (res.kill) {
      const dropText = res.kill.drops.length ? `, dropped ${res.kill.drops.join(', ')}` : '';
      resultLines.push(`☠️ Defeated! +${res.kill.xp} XP, +${res.kill.coins} coins${dropText}.`);
      if (res.kill.leveledUp) {
        resultLines.push(`✨ **Level up!** ${char.name} is now level ${res.kill.newLevel}. Full heal.`);
      }
    } else if (res.counter) {
      resultLines.push(res.counter.log);
      if (char.hp <= 0) {
        resultLines.push(`💀 ${char.name} fell. Respawning at the plaza, dropped half their coins.`);
      }
    }

    viewportPos = char.pos;
    viewportWorld = w;
  });

  if (missing) {
    await interaction.reply({ content: 'You have not joined. Use `/rpg join` first.', ephemeral: true });
    return;
  }
  if (cooldownMsg) {
    await interaction.reply({ content: cooldownMsg, ephemeral: true });
    return;
  }

  const embed = new EmbedBuilder().setColor(0xe74c3c).setDescription(resultLines.join('\n'));
  if (viewportWorld && viewportPos) {
    embed.setDescription(resultLines.join('\n') + '\n\n' + renderViewport(viewportWorld, viewportPos, 5));
  }
  await interaction.reply({ embeds: [embed] });
}

async function handlePickup(
  interaction: ChatInputCommandInteraction,
  userId: string,
): Promise<void> {
  let pickedUp: string | null = null;
  let missing = false;

  await updateWorld(interaction.guildId!, (w) => {
    tickWorld(w);
    const char = w.chars[userId];
    if (!char) { missing = true; return; }
    const loot = lootAt(w, char.pos[0], char.pos[1]);
    if (!loot) return;
    const coinMatch = loot.item.match(/^(\d+)-coins$/);
    if (coinMatch) {
      const amt = parseInt(coinMatch[1], 10);
      char.coins += amt;
      pickedUp = `${amt} coins`;
    } else {
      char.inventory.push(loot.item);
      pickedUp = loot.item;
    }
    delete w.loot[loot.id];
  });

  if (missing) {
    await interaction.reply({ content: 'You have not joined. Use `/rpg join` first.', ephemeral: true });
    return;
  }
  if (!pickedUp) {
    await interaction.reply({ content: 'Nothing to pick up on this tile.', ephemeral: true });
    return;
  }
  await interaction.reply({ content: `💰 Picked up **${pickedUp}**.` });
}

async function handleUse(
  interaction: ChatInputCommandInteraction,
  userId: string,
): Promise<void> {
  let outcome: string | null = null;
  let missing = false;

  await updateWorld(interaction.guildId!, (w) => {
    tickWorld(w);
    const char = w.chars[userId];
    if (!char) { missing = true; return; }
    const idx = char.inventory.findIndex((i) => i === 'healing-potion');
    if (idx < 0) { outcome = 'No healing potion in inventory.'; return; }
    char.inventory.splice(idx, 1);
    const before = char.hp;
    char.hp = Math.min(char.maxHp, char.hp + 12);
    outcome = `🧪 ${char.name} drinks a healing potion. HP ${before} → ${char.hp}.`;
  });

  if (missing) {
    await interaction.reply({ content: 'You have not joined. Use `/rpg join` first.', ephemeral: true });
    return;
  }
  await interaction.reply({ content: outcome ?? 'Nothing happens.' });
}

async function handleMap(
  interaction: ChatInputCommandInteraction,
  userId: string,
): Promise<void> {
  const world = await updateWorld(interaction.guildId!, (w) => { tickWorld(w); });
  const char = world.chars[userId];
  const center: [number, number] = char ? char.pos : world.spawn;
  const embed = new EmbedBuilder()
    .setColor(0x16a085)
    .setTitle('🗺️ The world')
    .setDescription(renderViewport(world, center, 7))
    .setFooter({ text: `Center (${center[0]}, ${center[1]}) — ${legend()}` });
  await interaction.reply({ embeds: [embed], ephemeral: !char });
}

async function handleTop(interaction: ChatInputCommandInteraction): Promise<void> {
  const world = await getOrCreateWorld(interaction.guildId!);
  const top = Object.values(world.chars)
    .sort((a, b) => b.xp - a.xp || b.kills - a.kills)
    .slice(0, 10);
  const desc = top.length
    ? top
        .map((c, i) => `**${i + 1}.** ${c.glyph} ${c.name} — lvl ${c.level} • ${c.xp} XP • ${c.kills} kills`)
        .join('\n')
    : 'No adventurers yet. Be the first with `/rpg join`.';
  const embed = new EmbedBuilder().setColor(0xf39c12).setTitle('🏆 Top adventurers').setDescription(desc);
  await interaction.reply({ embeds: [embed] });
}

async function handleLeave(
  interaction: ChatInputCommandInteraction,
  userId: string,
): Promise<void> {
  let had = false;
  await updateWorld(interaction.guildId!, (w) => {
    if (w.chars[userId]) { had = true; delete w.chars[userId]; }
  });
  await interaction.reply({
    content: had ? 'You have left the world. Your character is gone.' : 'You were not in the world.',
    ephemeral: true,
  });
}

function pickAdjacentMob(world: World, char: Character): Mob | null {
  let best: { mob: Mob; dist: number } | null = null;
  for (const m of Object.values(world.mobs)) {
    const d = cheby(char.pos, m.pos);
    if (d <= 1 && (!best || d < best.dist)) best = { mob: m, dist: d };
  }
  return best?.mob ?? null;
}

function dirName(dir: Dir): string {
  return {
    n: 'north', s: 'south', e: 'east', w: 'west',
    ne: 'northeast', nw: 'northwest', se: 'southeast', sw: 'southwest',
  }[dir];
}
