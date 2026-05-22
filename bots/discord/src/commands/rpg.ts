import {
  ActionRowBuilder,
  AutocompleteInteraction,
  ButtonBuilder,
  ButtonStyle,
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
  effectiveStats,
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
import { startDuel, startTrade } from './rpg-buttons.ts';
import { ITEMS, ItemDef, getItem, isWeapon, shopCatalog } from '../rpg/items.ts';
import { buyItem, onPlaza, sellItem } from '../rpg/shop.ts';
import { rollBounty } from '../rpg/bounty.ts';
import {
  buildControllerEmbed,
  buildControllerRows,
  hpBar,
} from '../rpg/controller.ts';

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
  .addSubcommand((s) => s.setName('leave').setDescription('Remove your character from this world'))
  .addSubcommand((s) =>
    s.setName('duel').setDescription('Challenge another player to a 1v1 duel')
      .addUserOption((o) => o.setName('target').setDescription('Player to challenge').setRequired(true)),
  )
  .addSubcommand((s) =>
    s.setName('trade').setDescription('Propose an item/coin trade with another player')
      .addUserOption((o) => o.setName('target').setDescription('Player to trade with').setRequired(true)),
  )
  .addSubcommand((s) =>
    s.setName('equip').setDescription('Equip a weapon or armor from your inventory')
      .addStringOption((o) =>
        o.setName('item').setDescription('Item to equip').setRequired(true).setAutocomplete(true),
      ),
  )
  .addSubcommand((s) =>
    s.setName('unequip').setDescription('Return an equipped item to your inventory')
      .addStringOption((o) =>
        o.setName('slot').setDescription('Slot to unequip').setRequired(true).addChoices(
          { name: 'weapon', value: 'weapon' },
          { name: 'armor', value: 'armor' },
        ),
      ),
  )
  .addSubcommand((s) => s.setName('shop').setDescription('See what the plaza shop sells'))
  .addSubcommand((s) =>
    s.setName('buy').setDescription('Buy an item from the plaza shop (must stand on the plaza)')
      .addStringOption((o) =>
        o.setName('item').setDescription('Item to buy').setRequired(true).setAutocomplete(true),
      ),
  )
  .addSubcommand((s) =>
    s.setName('sell').setDescription('Sell an item from your inventory (must stand on the plaza)')
      .addStringOption((o) =>
        o.setName('item').setDescription('Item to sell').setRequired(true).setAutocomplete(true),
      ),
  )
  .addSubcommand((s) => s.setName('bounty').setDescription('View your current bounty (auto-rolls a new one if none)'))
  .addSubcommand((s) => s.setName('play').setDescription('Open a button-driven controller: walk, attack, loot in place'))
  .addSubcommand((s) => s.setName('help').setDescription('Quickstart and command reference'));

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
      case 'duel': return handleDuel(interaction, userId);
      case 'trade': return handleTradeStart(interaction, userId);
      case 'equip': return handleEquip(interaction, userId);
      case 'unequip': return handleUnequip(interaction, userId);
      case 'shop': return handleShop(interaction);
      case 'buy': return handleBuy(interaction, userId);
      case 'sell': return handleSell(interaction, userId);
      case 'bounty': return handleBounty(interaction, userId);
      case 'play': return handlePlay(interaction, userId);
      case 'help': return handleHelp(interaction);
    }
  },
  async autocomplete(interaction: AutocompleteInteraction) {
    if (!interaction.inGuild()) {
      await interaction.respond([]);
      return;
    }
    const sub = interaction.options.getSubcommand();
    const focused = interaction.options.getFocused()?.toString().toLowerCase() ?? '';

    if (sub === 'buy') {
      const matches = shopCatalog()
        .filter((i) => i.slug.includes(focused) || i.label.toLowerCase().includes(focused))
        .slice(0, 25)
        .map((i) => ({ name: `${i.label} — ${i.buy}c`, value: i.slug }));
      await interaction.respond(matches);
      return;
    }

    const world = await getOrCreateWorld(interaction.guildId!);
    const char = world.chars[interaction.user.id];
    if (!char) { await interaction.respond([]); return; }

    if (sub === 'equip') {
      const seen = new Set<string>();
      const matches: { name: string; value: string }[] = [];
      for (const slug of char.inventory) {
        if (seen.has(slug)) continue;
        seen.add(slug);
        const item = getItem(slug);
        if (!item || (item.kind !== 'weapon' && item.kind !== 'armor')) continue;
        if (!slug.includes(focused) && !item.label.toLowerCase().includes(focused)) continue;
        matches.push({ name: `${item.label} (${item.desc ?? item.kind})`, value: slug });
        if (matches.length >= 25) break;
      }
      await interaction.respond(matches);
      return;
    }

    if (sub === 'sell') {
      const seen = new Set<string>();
      const matches: { name: string; value: string }[] = [];
      for (const slug of char.inventory) {
        if (seen.has(slug)) continue;
        seen.add(slug);
        const item = getItem(slug);
        if (!item) continue;
        if (!slug.includes(focused) && !item.label.toLowerCase().includes(focused)) continue;
        matches.push({ name: `${item.label} — sells for ${item.sell}c`, value: slug });
        if (matches.length >= 25) break;
      }
      await interaction.respond(matches);
      return;
    }

    await interaction.respond([]);
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
    const fresh: Character = {
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
      equipment: { weapon: null, armor: null },
      bounty: null,
      lastAttackAt: 0,
      lastMoveAt: 0,
    };
    rollBounty(fresh);
    w.chars[userId] = fresh;
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
  const eff = effectiveStats(char);
  const atkLine = eff.bonusAtk > 0 ? `${eff.atk} (${char.atk} +${eff.bonusAtk})` : `${eff.atk}`;
  const defLine = eff.bonusDef > 0 ? `${eff.def} (${char.def} +${eff.bonusDef})` : `${eff.def}`;
  const embed = new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle(`${char.glyph} ${char.name}`)
    .setDescription(
      `Lvl **${char.level}** • ${char.xp} XP (next in ${xpToNext(char.xp)})`,
    )
    .addFields(
      { name: 'HP', value: `${hpBar(char.hp, char.maxHp)} ${char.hp}/${char.maxHp}`, inline: false },
      { name: 'ATK / DEF', value: `${atkLine} / ${defLine}`, inline: true },
      { name: 'Coins', value: `${char.coins}`, inline: true },
      { name: 'Kills / Deaths', value: `${char.kills} / ${char.deaths}`, inline: true },
      { name: 'Position', value: `(${char.pos[0]}, ${char.pos[1]})`, inline: true },
      { name: 'Cooldown', value: cooldownMs > 0 ? fmtCooldown(cooldownMs) : 'ready', inline: true },
      { name: 'Equipped', value: equipLine(char), inline: false },
      { name: 'Bounty', value: bountyLine(char), inline: false },
      { name: 'Inventory', value: inventoryLine(char) },
    );
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

function equipLine(char: Character): string {
  const parts: string[] = [];
  const w = char.equipment.weapon ? ITEMS[char.equipment.weapon] : null;
  const a = char.equipment.armor ? ITEMS[char.equipment.armor] : null;
  parts.push(w ? `🗡️ ${w.label} (${w.desc ?? `+${w.atk} ATK`})` : '🗡️ — bare hands —');
  parts.push(a ? `🛡️ ${a.label} (${a.desc ?? `+${a.def} DEF`})` : '🛡️ — no armor —');
  return parts.join('\n');
}

function bountyLine(char: Character): string {
  if (!char.bounty) return '— none. Use `/rpg bounty` to take one. —';
  const kind = MOB_KINDS[char.bounty.target];
  const targetLabel = kind ? `${kind.glyph} ${kind.name.toLowerCase()}s` : char.bounty.target;
  return `🎯 Slay ${char.bounty.goal} ${targetLabel} — **${char.bounty.progress}/${char.bounty.goal}** — reward ${char.bounty.xpReward} XP + ${char.bounty.coinReward} coins`;
}

function inventoryLine(char: Character): string {
  if (char.inventory.length === 0) return '— empty —';
  const counts: Record<string, number> = {};
  for (const slug of char.inventory) counts[slug] = (counts[slug] ?? 0) + 1;
  return Object.entries(counts)
    .map(([slug, n]) => {
      const item = ITEMS[slug];
      const label = item?.label ?? slug;
      return n > 1 ? `${label} ×${n}` : label;
    })
    .join(', ');
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
      if (res.kill.bounty) {
        const b = res.kill.bounty;
        resultLines.push(`🎯 **Bounty complete!** +${b.xp} XP, +${b.coins} coins. Take a new one with \`/rpg bounty\`.`);
        if (b.leveledUp && !res.kill.leveledUp) {
          resultLines.push(`✨ **Level up!** ${char.name} is now level ${b.newLevel}. Full heal.`);
        }
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

async function handleDuel(
  interaction: ChatInputCommandInteraction,
  userId: string,
): Promise<void> {
  const target = interaction.options.getUser('target', true);

  if (target.id === userId) {
    await interaction.reply({ content: 'You cannot duel yourself.', ephemeral: true });
    return;
  }
  if (target.bot) {
    await interaction.reply({ content: 'You cannot duel a bot.', ephemeral: true });
    return;
  }

  const world = await getOrCreateWorld(interaction.guildId!);
  const challenger = world.chars[userId];
  if (!challenger) {
    await interaction.reply({ content: 'You have not joined. Use `/rpg join` first.', ephemeral: true });
    return;
  }
  const defender = world.chars[target.id];
  if (!defender) {
    await interaction.reply({ content: `<@${target.id}> has not joined the RPG yet.`, ephemeral: true });
    return;
  }

  // Post the challenge message first to get the message ID.
  const placeholder = await interaction.reply({
    content: `⚔️ ${challenger.glyph} **${challenger.name}** challenges ${defender.glyph} **${defender.name}** to a duel!`,
    components: [],
    withResponse: true,
  });

  const messageId = placeholder.resource?.message?.id ?? '';
  const channelId = interaction.channelId;

  let duelId = '';
  await updateWorld(interaction.guildId!, (w) => {
    const duel = startDuel(w, userId, target.id, messageId, channelId);
    duelId = duel.id;
  });

  const acceptBtn = new ButtonBuilder()
    .setCustomId(`rpg:duel:accept:${duelId}`)
    .setLabel('Accept')
    .setStyle(ButtonStyle.Success);
  const declineBtn = new ButtonBuilder()
    .setCustomId(`rpg:duel:decline:${duelId}`)
    .setLabel('Decline')
    .setStyle(ButtonStyle.Danger);
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(acceptBtn, declineBtn);

  await interaction.editReply({
    content: `⚔️ ${challenger.glyph} **${challenger.name}** challenges ${defender.glyph} **${defender.name}** to a duel!\n<@${target.id}> — do you accept? (expires in 60s)`,
    components: [row],
  });
}

async function handleTradeStart(
  interaction: ChatInputCommandInteraction,
  userId: string,
): Promise<void> {
  const target = interaction.options.getUser('target', true);

  if (target.id === userId) {
    await interaction.reply({ content: 'You cannot trade with yourself.', ephemeral: true });
    return;
  }
  if (target.bot) {
    await interaction.reply({ content: 'You cannot trade with a bot.', ephemeral: true });
    return;
  }

  const world = await getOrCreateWorld(interaction.guildId!);
  const charA = world.chars[userId];
  if (!charA) {
    await interaction.reply({ content: 'You have not joined. Use `/rpg join` first.', ephemeral: true });
    return;
  }
  const charB = world.chars[target.id];
  if (!charB) {
    await interaction.reply({ content: `<@${target.id}> has not joined the RPG yet.`, ephemeral: true });
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(0xe67e22)
    .setTitle('🤝 Trade Proposal')
    .addFields(
      { name: `⏳ <@${userId}> offers`, value: 'Coins: 0\nItems: —', inline: true },
      { name: `⏳ <@${target.id}> offers`, value: 'Coins: 0\nItems: —', inline: true },
    )
    .setFooter({ text: 'Both sides must confirm to execute. Any change resets confirmations.' });

  const placeholder = await interaction.reply({
    embeds: [embed],
    components: [],
    withResponse: true,
  });

  const messageId = placeholder.resource?.message?.id ?? '';
  const channelId = interaction.channelId;

  let tradeId = '';
  await updateWorld(interaction.guildId!, (w) => {
    const trade = startTrade(w, userId, target.id, messageId, channelId);
    tradeId = trade.id;
  });

  // Rebuild components now that we have the trade ID.
  const aItems = charA.inventory;
  const bItems = charB.inventory;

  const rows: ActionRowBuilder<ButtonBuilder>[] = [];

  rows.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`rpg:trade:coins:${tradeId}:a:10`)
        .setLabel('A +10 coins')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`rpg:trade:coins:${tradeId}:a:-10`)
        .setLabel('A -10 coins')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`rpg:trade:coins:${tradeId}:b:10`)
        .setLabel('B +10 coins')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`rpg:trade:coins:${tradeId}:b:-10`)
        .setLabel('B -10 coins')
        .setStyle(ButtonStyle.Secondary),
    ),
  );

  rows.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`rpg:trade:confirm:${tradeId}:a`)
        .setLabel('✅ Confirm (A)')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`rpg:trade:confirm:${tradeId}:b`)
        .setLabel('✅ Confirm (B)')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`rpg:trade:cancel:${tradeId}`)
        .setLabel('❌ Cancel')
        .setStyle(ButtonStyle.Danger),
    ),
  );

  void aItems; void bItems;

  await interaction.editReply({ embeds: [embed], components: rows });
}

async function handleEquip(
  interaction: ChatInputCommandInteraction,
  userId: string,
): Promise<void> {
  const slug = interaction.options.getString('item', true);
  let outcome: string | null = null;
  let missing = false;

  await updateWorld(interaction.guildId!, (w) => {
    const char = w.chars[userId];
    if (!char) { missing = true; return; }
    const item = getItem(slug);
    if (!item) { outcome = `Unknown item **${slug}**.`; return; }
    if (item.kind !== 'weapon' && item.kind !== 'armor') {
      outcome = `${item.label} is not equippable.`;
      return;
    }
    const idx = char.inventory.indexOf(slug);
    if (idx < 0) { outcome = `You don't have a **${item.label}** to equip.`; return; }

    const slot: 'weapon' | 'armor' = isWeapon(slug) ? 'weapon' : 'armor';
    char.inventory.splice(idx, 1);
    const previous = char.equipment[slot];
    char.equipment[slot] = slug;
    if (previous) char.inventory.push(previous);
    const prevText = previous ? ` (returned ${ITEMS[previous]?.label ?? previous} to inventory)` : '';
    outcome = `🎽 Equipped **${item.label}** — ${item.desc ?? ''}${prevText}.`;
  });

  if (missing) {
    await interaction.reply({ content: 'You have not joined. Use `/rpg join` first.', ephemeral: true });
    return;
  }
  await interaction.reply({ content: outcome ?? 'Nothing happens.', ephemeral: true });
}

async function handleUnequip(
  interaction: ChatInputCommandInteraction,
  userId: string,
): Promise<void> {
  const slot = interaction.options.getString('slot', true) as 'weapon' | 'armor';
  let outcome: string | null = null;
  let missing = false;

  await updateWorld(interaction.guildId!, (w) => {
    const char = w.chars[userId];
    if (!char) { missing = true; return; }
    const slug = char.equipment[slot];
    if (!slug) { outcome = `Nothing equipped in the ${slot} slot.`; return; }
    char.equipment[slot] = null;
    char.inventory.push(slug);
    outcome = `🎽 Unequipped **${ITEMS[slug]?.label ?? slug}** — returned to inventory.`;
  });

  if (missing) {
    await interaction.reply({ content: 'You have not joined. Use `/rpg join` first.', ephemeral: true });
    return;
  }
  await interaction.reply({ content: outcome ?? 'Nothing happens.', ephemeral: true });
}

function formatCatalogLine(item: ItemDef): string {
  const stat = item.atk ? `+${item.atk} ATK` : item.def ? `+${item.def} DEF` : item.desc ?? item.kind;
  return `• ${item.glyph} **${item.label}** — ${item.buy}c (${stat}) [\`${item.slug}\`]`;
}

async function handleShop(interaction: ChatInputCommandInteraction): Promise<void> {
  const lines = shopCatalog().map(formatCatalogLine);
  const embed = new EmbedBuilder()
    .setColor(0x1abc9c)
    .setTitle('🏪 Plaza Shop')
    .setDescription(
      [
        'Stand on a 🟧 plaza tile to `/rpg buy` or `/rpg sell`.',
        '',
        ...lines,
        '',
        '_Sell prices are roughly a third of buy price. Materials (slime jelly, wolf pelt, troll tooth) only sell._',
      ].join('\n'),
    );
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleBuy(
  interaction: ChatInputCommandInteraction,
  userId: string,
): Promise<void> {
  const slug = interaction.options.getString('item', true);
  let outcome: string | null = null;
  let missing = false;
  let notOnPlaza = false;

  await updateWorld(interaction.guildId!, (w) => {
    const char = w.chars[userId];
    if (!char) { missing = true; return; }
    if (!onPlaza(w, char)) { notOnPlaza = true; return; }
    const res = buyItem(char, slug);
    if (!res.ok) { outcome = res.reason ?? 'Could not buy.'; return; }
    outcome = `🛒 Bought **${res.item?.label}** for ${res.cost}c. Coins left: ${char.coins}.`;
  });

  if (missing) {
    await interaction.reply({ content: 'You have not joined. Use `/rpg join` first.', ephemeral: true });
    return;
  }
  if (notOnPlaza) {
    await interaction.reply({ content: 'You must stand on a 🟧 plaza tile to use the shop.', ephemeral: true });
    return;
  }
  await interaction.reply({ content: outcome ?? 'Nothing happens.', ephemeral: true });
}

async function handleSell(
  interaction: ChatInputCommandInteraction,
  userId: string,
): Promise<void> {
  const slug = interaction.options.getString('item', true);
  let outcome: string | null = null;
  let missing = false;
  let notOnPlaza = false;

  await updateWorld(interaction.guildId!, (w) => {
    const char = w.chars[userId];
    if (!char) { missing = true; return; }
    if (!onPlaza(w, char)) { notOnPlaza = true; return; }
    const res = sellItem(char, slug);
    if (!res.ok) { outcome = res.reason ?? 'Could not sell.'; return; }
    outcome = `💰 Sold **${res.item?.label}** for ${res.gained}c. Coins: ${char.coins}.`;
  });

  if (missing) {
    await interaction.reply({ content: 'You have not joined. Use `/rpg join` first.', ephemeral: true });
    return;
  }
  if (notOnPlaza) {
    await interaction.reply({ content: 'You must stand on a 🟧 plaza tile to use the shop.', ephemeral: true });
    return;
  }
  await interaction.reply({ content: outcome ?? 'Nothing happens.', ephemeral: true });
}

async function handleBounty(
  interaction: ChatInputCommandInteraction,
  userId: string,
): Promise<void> {
  let outcome: { rolled: boolean; char: Character | null } = { rolled: false, char: null };
  let missing = false;

  await updateWorld(interaction.guildId!, (w) => {
    const char = w.chars[userId];
    if (!char) { missing = true; return; }
    if (!char.bounty) {
      rollBounty(char);
      outcome.rolled = true;
    }
    outcome.char = char;
  });

  if (missing) {
    await interaction.reply({ content: 'You have not joined. Use `/rpg join` first.', ephemeral: true });
    return;
  }
  const char = outcome.char!;
  const b = char.bounty;
  if (!b) {
    await interaction.reply({ content: 'No bounty available. Try again later.', ephemeral: true });
    return;
  }
  const kind = MOB_KINDS[b.target];
  const targetLabel = kind ? `${kind.glyph} ${kind.name.toLowerCase()}s` : b.target;
  const header = outcome.rolled ? '🎯 **New bounty rolled**' : '🎯 **Active bounty**';
  const embed = new EmbedBuilder()
    .setColor(0xe67e22)
    .setTitle(header)
    .setDescription(
      [
        `Slay **${b.goal} ${targetLabel}**`,
        `Progress: **${b.progress}/${b.goal}**`,
        `Reward: ${b.xpReward} XP + ${b.coinReward} coins`,
        '',
        'Auto-claims the moment the last kill lands. A fresh bounty rolls next time you run `/rpg bounty`.',
      ].join('\n'),
    );
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handlePlay(
  interaction: ChatInputCommandInteraction,
  userId: string,
): Promise<void> {
  let missing = false;
  const world = await updateWorld(interaction.guildId!, (w) => {
    tickWorld(w);
    if (!w.chars[userId]) missing = true;
  });

  if (missing) {
    await interaction.reply({ content: 'You have not joined. Use `/rpg join` first.', ephemeral: true });
    return;
  }
  const char = world.chars[userId];
  const embed = buildControllerEmbed(world, char);
  const rows = buildControllerRows();
  await interaction.reply({ embeds: [embed], components: rows, ephemeral: true });
}

async function handleHelp(interaction: ChatInputCommandInteraction): Promise<void> {
  const embed = new EmbedBuilder()
    .setColor(0x16a085)
    .setTitle('🗺️ /rpg quickstart')
    .setDescription(
      [
        '**Step 1.** `/rpg join` — spawn at the plaza.',
        '**Step 2.** `/rpg play` — open a button-driven controller (recommended).',
        '**Step 3.** Click direction arrows to walk. Adjacent enemies show a target line — click ⚔ Attack.',
        '**Step 4.** Loot is auto-collected when you walk over it. Drink a potion with 🧪 when low on HP.',
        '',
        '**Combat math** — `d20 + ATK vs 10 + DEF`. Nat 1 misses, nat 20 crits (2× damage). 3-second cooldown between swings.',
        '**Death** — respawn at the plaza, drop half your coins. Equipment is never lost.',
        '',
        '**Other commands**',
        '`/rpg me` — character sheet, equipped gear, bounty, inventory.',
        '`/rpg map` — public viewport (no buttons).',
        '`/rpg shop` `/rpg buy` `/rpg sell` — plaza-tile shop (stand on 🟧).',
        '`/rpg equip` `/rpg unequip` — manage weapon/armor slots.',
        '`/rpg bounty` — view or roll a new kill quest.',
        '`/rpg duel @user` — 1v1 consented PvP (no real damage).',
        '`/rpg trade @user` — atomic item + coin swap with consent.',
        '`/rpg top` — XP leaderboard.',
        '`/rpg leave` — delete your character.',
      ].join('\n'),
    );
  await interaction.reply({ embeds: [embed], ephemeral: true });
}
