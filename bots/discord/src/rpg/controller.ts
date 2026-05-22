import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from 'discord.js';
import {
  Character,
  MOB_KINDS,
  Mob,
  World,
  cheby,
  effectiveStats,
  entityAt,
  isWalkable,
  lootAt,
  terrainAt,
  xpToNext,
} from './world.ts';
import { renderViewport } from './render.ts';
import {
  attackCooldownRemainingMs,
  charAttackMob,
} from './combat.ts';
import { tickWorld } from './tick.ts';

const HP_BAR_LEN = 10;

export function hpBar(hp: number, maxHp: number): string {
  const ratio = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
  const filled = Math.round(ratio * HP_BAR_LEN);
  return '█'.repeat(filled) + '░'.repeat(HP_BAR_LEN - filled);
}

export type CtlDir = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

const DIR_VEC: Record<CtlDir, [number, number]> = {
  n: [-1, 0],  s: [1, 0],
  e: [0, 1],   w: [0, -1],
  ne: [-1, 1], nw: [-1, -1],
  se: [1, 1],  sw: [1, -1],
};

export interface CtlActionResult {
  ok: boolean;
  // Status line printed above the viewport on the next render.
  banner?: string;
}

export function ctlMove(world: World, char: Character, dir: CtlDir): CtlActionResult {
  const [dr, dc] = DIR_VEC[dir];
  const nr = char.pos[0] + dr;
  const nc = char.pos[1] + dc;
  const token = terrainAt(world, nr, nc);
  if (!isWalkable(token)) {
    const reason = token === '~' ? 'water' : token === '^' ? 'mountain' : 'wall';
    return { ok: false, banner: `🚫 Blocked by ${reason}.` };
  }
  const ent = entityAt(world, nr, nc);
  if (ent) {
    return { ok: false, banner: '🚫 Someone stands in your way — try attack.' };
  }
  char.pos = [nr, nc];
  char.lastMoveAt = Date.now();
  const loot = lootAt(world, nr, nc);
  if (!loot) return { ok: true };
  const coinMatch = loot.item.match(/^(\d+)-coins$/);
  if (coinMatch) {
    const amt = parseInt(coinMatch[1], 10);
    char.coins += amt;
    delete world.loot[loot.id];
    return { ok: true, banner: `💰 Picked up ${amt} coins.` };
  }
  char.inventory.push(loot.item);
  delete world.loot[loot.id];
  return { ok: true, banner: `💰 Picked up **${loot.item}**.` };
}

export function ctlAttack(world: World, char: Character): CtlActionResult {
  if (char.hp <= 0) return { ok: false, banner: 'You are unconscious.' };
  const cd = attackCooldownRemainingMs(char);
  if (cd > 0) return { ok: false, banner: `⏳ On cooldown — ${(cd / 1000).toFixed(1)}s.` };
  const target = pickAdjacentMob(world, char);
  if (!target) return { ok: false, banner: 'Nothing adjacent to attack.' };
  const res = charAttackMob(world, char, target);
  if (!res) return { ok: false, banner: 'Target out of reach.' };
  const lines: string[] = [res.attack.log];
  if (res.kill) {
    const dropText = res.kill.drops.length ? `, dropped ${res.kill.drops.join(', ')}` : '';
    lines.push(`☠️ +${res.kill.xp} XP, +${res.kill.coins} coins${dropText}.`);
    if (res.kill.leveledUp) lines.push(`✨ Level up! Now level ${res.kill.newLevel}.`);
    if (res.kill.bounty) {
      const b = res.kill.bounty;
      lines.push(`🎯 Bounty complete! +${b.xp} XP, +${b.coins} coins.`);
    }
  } else if (res.counter) {
    lines.push(res.counter.log);
    if (char.hp <= 0) lines.push(`💀 You fell — respawning at the plaza.`);
  }
  return { ok: true, banner: lines.join('\n') };
}

export function ctlPickup(world: World, char: Character): CtlActionResult {
  const loot = lootAt(world, char.pos[0], char.pos[1]);
  if (!loot) return { ok: false, banner: 'Nothing on this tile.' };
  const coinMatch = loot.item.match(/^(\d+)-coins$/);
  if (coinMatch) {
    const amt = parseInt(coinMatch[1], 10);
    char.coins += amt;
    delete world.loot[loot.id];
    return { ok: true, banner: `💰 Picked up ${amt} coins.` };
  }
  char.inventory.push(loot.item);
  delete world.loot[loot.id];
  return { ok: true, banner: `💰 Picked up **${loot.item}**.` };
}

export function ctlUsePotion(_world: World, char: Character): CtlActionResult {
  const idx = char.inventory.indexOf('healing-potion');
  if (idx < 0) return { ok: false, banner: 'No healing potion in inventory.' };
  char.inventory.splice(idx, 1);
  const before = char.hp;
  char.hp = Math.min(char.maxHp, char.hp + 12);
  return { ok: true, banner: `🧪 Drank potion. HP ${before} → ${char.hp}.` };
}

function pickAdjacentMob(world: World, char: Character): Mob | null {
  let best: { mob: Mob; dist: number } | null = null;
  for (const m of Object.values(world.mobs)) {
    const d = cheby(char.pos, m.pos);
    if (d <= 1 && (!best || d < best.dist)) best = { mob: m, dist: d };
  }
  return best?.mob ?? null;
}

// Returns the strongest target hint to show in the embed status line.
function adjacentTarget(world: World, char: Character):
  | { glyph: string; name: string; hp: number; maxHp: number }
  | null {
  const adj = pickAdjacentMob(world, char);
  if (!adj) return null;
  const k = MOB_KINDS[adj.kind];
  if (!k) return null;
  return { glyph: k.glyph, name: k.name, hp: adj.hp, maxHp: k.hp };
}

export function buildControllerEmbed(
  world: World,
  char: Character,
  banner?: string,
  tickBanner?: string,
): EmbedBuilder {
  const eff = effectiveStats(char);
  const cd = attackCooldownRemainingMs(char);
  const cdText = cd > 0 ? `⏳ ${(cd / 1000).toFixed(1)}s` : '⚔️ ready';

  const hpLine = `❤️ ${hpBar(char.hp, char.maxHp)} **${char.hp}/${char.maxHp}**`;
  const statsLine = `⚔️ ${eff.atk} 🛡️ ${eff.def} 💰 ${char.coins} • Lvl ${char.level} (${xpToNext(char.xp)} to next)`;

  const tgt = adjacentTarget(world, char);
  const targetLine = tgt
    ? `🎯 ${tgt.glyph} **${tgt.name}** ${hpBar(tgt.hp, tgt.maxHp)} ${tgt.hp}/${tgt.maxHp}`
    : null;

  const viewport = renderViewport(world, char.pos, 5);
  const parts: string[] = [hpLine, statsLine];
  if (targetLine) parts.push(targetLine);
  if (banner) parts.push('', banner);
  if (tickBanner) parts.push(tickBanner);
  parts.push('', viewport);

  return new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle(`${char.glyph} ${char.name} — ${cdText}`)
    .setDescription(parts.join('\n'))
    .setFooter({ text: `(${char.pos[0]}, ${char.pos[1]}) — buttons go inactive after ~15 min of idle` });
}

export function buildControllerRows(): ActionRowBuilder<ButtonBuilder>[] {
  const b = (id: string, label: string, style: ButtonStyle): ButtonBuilder =>
    new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style);

  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      b('rpg:ctl:move:nw', '↖', ButtonStyle.Secondary),
      b('rpg:ctl:move:n',  '⬆', ButtonStyle.Secondary),
      b('rpg:ctl:move:ne', '↗', ButtonStyle.Secondary),
      b('rpg:ctl:attack',  '⚔ Attack', ButtonStyle.Danger),
      b('rpg:ctl:refresh', '🔄', ButtonStyle.Primary),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      b('rpg:ctl:move:w',  '⬅', ButtonStyle.Secondary),
      b('rpg:ctl:pickup',  '💰 Pickup', ButtonStyle.Primary),
      b('rpg:ctl:move:e',  '➡', ButtonStyle.Secondary),
      b('rpg:ctl:use',     '🧪 Potion', ButtonStyle.Success),
      b('rpg:ctl:close',   '✖', ButtonStyle.Secondary),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      b('rpg:ctl:move:sw', '↙', ButtonStyle.Secondary),
      b('rpg:ctl:move:s',  '⬇', ButtonStyle.Secondary),
      b('rpg:ctl:move:se', '↘', ButtonStyle.Secondary),
    ),
  ];
}

export function tickBanner(world: World): string | null {
  const events = tickWorld(world);
  if (events.length === 0) return null;
  return events.slice(0, 4).map((e) => `• ${e.log}`).join('\n');
}
