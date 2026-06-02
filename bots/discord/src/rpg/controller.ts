import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
} from 'discord.js';
import {
  Character,
  MOB_KINDS,
  MS_PER_TICK,
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

// Format a remaining-tick duration as seconds for display.
function ticksToSec(ticks: number): string {
  return ((ticks * MS_PER_TICK) / 1000).toFixed(1);
}
import { renderViewport, mapLegend } from './render.ts';
import {
  attackCooldownRemainingTicks,
  charAttackMob,
  respawnProtectRemainingTicks,
} from './combat.ts';
import { ITEMS, getItem, isWeapon, shopCatalog } from './items.ts';
import { buyItem, onPlaza, sellItem } from './shop.ts';
import { rollBounty } from './bounty.ts';

export type CtlScreen = 'world' | 'bag' | 'town' | 'sheet' | 'nearby';

// How close another player must be to duel / trade with them.
export const NEARBY_RANGE = 3;

// Other active (present, alive) players within NEARBY_RANGE of this character.
export function nearbyPlayers(world: World, char: Character): Character[] {
  const out: Character[] = [];
  for (const c of Object.values(world.chars)) {
    if (c.userId === char.userId) continue;
    if (c.hp <= 0 || c.away) continue;
    if (cheby(char.pos, c.pos) <= NEARBY_RANGE) out.push(c);
  }
  return out;
}

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
  char.lastMoveAt = world.tick;
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

// Step once toward the nearest mob, picking the direction automatically. Saves
// the player from eyeballing the diagonal across a large map.
export function ctlApproach(world: World, char: Character): CtlActionResult {
  let best: { mob: Mob; dist: number } | null = null;
  for (const m of Object.values(world.mobs)) {
    const d = cheby(char.pos, m.pos);
    if (!best || d < best.dist) best = { mob: m, dist: d };
  }
  if (!best) return { ok: false, banner: 'No enemies in the world right now.' };
  if (best.dist <= 1) return { ok: false, banner: '⚔️ Already next to a foe — press Attack.' };

  const dr = Math.sign(best.mob.pos[0] - char.pos[0]);
  const dc = Math.sign(best.mob.pos[1] - char.pos[1]);
  // Prefer the diagonal toward the target, then each axis.
  const tries: [number, number][] = [
    [char.pos[0] + dr, char.pos[1] + dc],
    [char.pos[0] + dr, char.pos[1]],
    [char.pos[0], char.pos[1] + dc],
  ];
  for (const [nr, nc] of tries) {
    if (!isWalkable(terrainAt(world, nr, nc))) continue;
    if (entityAt(world, nr, nc)) continue;
    char.pos = [nr, nc];
    char.lastMoveAt = world.tick;
    const loot = lootAt(world, nr, nc);
    if (loot) {
      const coinMatch = loot.item.match(/^(\d+)-coins$/);
      if (coinMatch) { char.coins += parseInt(coinMatch[1], 10); delete world.loot[loot.id]; }
      else { char.inventory.push(loot.item); delete world.loot[loot.id]; }
    }
    return { ok: true, banner: '🏃 You move toward the nearest enemy.' };
  }
  return { ok: false, banner: '🚫 The way toward the enemy is blocked.' };
}

export function ctlAttack(world: World, char: Character): CtlActionResult {
  if (char.hp <= 0) return { ok: false, banner: 'You are unconscious.' };
  const prot = respawnProtectRemainingTicks(char, world.tick);
  if (prot > 0) {
    return { ok: false, banner: `🛡️ Recovering — safe for ${ticksToSec(prot)}s. Attacking ends your protection.` };
  }
  const cd = attackCooldownRemainingTicks(char, world.tick);
  if (cd > 0) return { ok: false, banner: `⏳ On cooldown — ${ticksToSec(cd)}s.` };
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

// ── Bag actions ──────────────────────────────────────────────────────────────

export function ctlEquip(char: Character, slug: string): CtlActionResult {
  const item = getItem(slug);
  if (!item) return { ok: false, banner: `Unknown item.` };
  if (item.kind !== 'weapon' && item.kind !== 'armor') {
    return { ok: false, banner: `${item.label} is not equippable.` };
  }
  const idx = char.inventory.indexOf(slug);
  if (idx < 0) return { ok: false, banner: `You don't have a ${item.label}.` };
  const slot: 'weapon' | 'armor' = isWeapon(slug) ? 'weapon' : 'armor';
  char.inventory.splice(idx, 1);
  const previous = char.equipment[slot];
  char.equipment[slot] = slug;
  if (previous) char.inventory.push(previous);
  const prevText = previous ? ` (returned ${ITEMS[previous]?.label ?? previous})` : '';
  return { ok: true, banner: `🎽 Equipped **${item.label}** — ${item.desc ?? ''}${prevText}.` };
}

export function ctlUnequip(char: Character, slot: 'weapon' | 'armor'): CtlActionResult {
  const slug = char.equipment[slot];
  if (!slug) return { ok: false, banner: `Nothing equipped in the ${slot} slot.` };
  char.equipment[slot] = null;
  char.inventory.push(slug);
  return { ok: true, banner: `🎽 Unequipped **${ITEMS[slug]?.label ?? slug}**.` };
}

// Use any consumable from the bag (currently the healing potion).
export function ctlUseItem(char: Character, slug: string): CtlActionResult {
  const item = getItem(slug);
  if (!item || item.kind !== 'consumable') {
    return { ok: false, banner: `${item?.label ?? slug} can't be used.` };
  }
  const idx = char.inventory.indexOf(slug);
  if (idx < 0) return { ok: false, banner: `You don't have a ${item.label}.` };
  if (slug === 'healing-potion') {
    char.inventory.splice(idx, 1);
    const before = char.hp;
    char.hp = Math.min(char.maxHp, char.hp + (item.hp ?? 12));
    return { ok: true, banner: `🧪 Used **${item.label}**. HP ${before} → ${char.hp}.` };
  }
  return { ok: false, banner: `Nothing happens.` };
}

// ── Town actions ─────────────────────────────────────────────────────────────

export function ctlBuy(world: World, char: Character, slug: string): CtlActionResult {
  if (!onPlaza(world, char)) return { ok: false, banner: 'Stand on a plaza tile to trade.' };
  const res = buyItem(char, slug);
  if (!res.ok) return { ok: false, banner: res.reason ?? 'Could not buy.' };
  return { ok: true, banner: `🛒 Bought **${res.item?.label}** for ${res.cost}c. Coins: ${char.coins}.` };
}

export function ctlSell(world: World, char: Character, slug: string): CtlActionResult {
  if (!onPlaza(world, char)) return { ok: false, banner: 'Stand on a plaza tile to trade.' };
  const res = sellItem(char, slug);
  if (!res.ok) return { ok: false, banner: res.reason ?? 'Could not sell.' };
  return { ok: true, banner: `💰 Sold **${res.item?.label}** for ${res.gained}c. Coins: ${char.coins}.` };
}

// ── Sheet actions ────────────────────────────────────────────────────────────

export function ctlRerollBounty(char: Character): CtlActionResult {
  rollBounty(char);
  return { ok: true, banner: '🎯 Rolled a fresh bounty.' };
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

// True when a mob is adjacent — drives the Attack button styling.
export function hasAdjacentMob(world: World, char: Character): boolean {
  return pickAdjacentMob(world, char) !== null;
}

// Whether the player carries a healing potion — drives the Potion button.
export function hasPotion(char: Character): boolean {
  return char.inventory.includes('healing-potion');
}

function compass(from: [number, number], to: [number, number]): string {
  const dr = to[0] - from[0];
  const dc = to[1] - from[1];
  const v = dr < 0 ? 'north' : dr > 0 ? 'south' : '';
  const h = dc < 0 ? 'west' : dc > 0 ? 'east' : '';
  return v + h || 'here';
}

// A short "what to do now" hint for the world screen.
function guidanceLine(world: World, char: Character): string | null {
  // Adjacent fight takes priority.
  const adj = pickAdjacentMob(world, char);
  if (adj) {
    const k = MOB_KINDS[adj.kind];
    return `⚔️ A ${k?.name ?? 'foe'} is next to you — press **Attack**!`;
  }
  // Otherwise point at the nearest mob within a generous range.
  let best: { mob: Mob; dist: number } | null = null;
  for (const m of Object.values(world.mobs)) {
    const d = cheby(char.pos, m.pos);
    if (!best || d < best.dist) best = { mob: m, dist: d };
  }
  if (best && best.dist <= 12) {
    const k = MOB_KINDS[best.mob.kind];
    return `🧭 Nearest ${k?.name ?? 'enemy'} is ${best.dist} tiles ${compass(char.pos, best.mob.pos)}.`;
  }
  return null;
}

function bountyGoalLine(char: Character): string | null {
  if (!char.bounty) return null;
  const kind = MOB_KINDS[char.bounty.target];
  const label = kind ? `${kind.glyph} ${kind.name.toLowerCase()}s` : char.bounty.target;
  return `🎯 Bounty: slay ${char.bounty.goal} ${label} — **${char.bounty.progress}/${char.bounty.goal}**`;
}

function statusLines(char: Character): string[] {
  const eff = effectiveStats(char);
  const hpLine = `❤️ ${hpBar(char.hp, char.maxHp)} **${char.hp}/${char.maxHp}**`;
  const statsLine = `⚔️ ${eff.atk} 🛡️ ${eff.def} 💰 ${char.coins} • Lvl ${char.level} (${xpToNext(char.xp)} to next)`;
  return [hpLine, statsLine];
}

function equipLine(char: Character): string {
  const w = char.equipment.weapon ? ITEMS[char.equipment.weapon] : null;
  const a = char.equipment.armor ? ITEMS[char.equipment.armor] : null;
  return [
    w ? `🗡️ ${w.label} (${w.desc ?? `+${w.atk} ATK`})` : '🗡️ — bare hands —',
    a ? `🛡️ ${a.label} (${a.desc ?? `+${a.def} DEF`})` : '🛡️ — no armor —',
  ].join('\n');
}

function inventoryLines(char: Character): string {
  if (char.inventory.length === 0) return '— empty —';
  const counts: Record<string, number> = {};
  for (const slug of char.inventory) counts[slug] = (counts[slug] ?? 0) + 1;
  return Object.entries(counts)
    .map(([slug, n]) => {
      const item = ITEMS[slug];
      const label = item ? `${item.glyph} ${item.label}` : slug;
      return n > 1 ? `${label} ×${n}` : label;
    })
    .join('\n');
}

function bountyLine(char: Character): string {
  if (!char.bounty) return '— none —';
  const kind = MOB_KINDS[char.bounty.target];
  const targetLabel = kind ? `${kind.glyph} ${kind.name.toLowerCase()}s` : char.bounty.target;
  return `🎯 Slay ${char.bounty.goal} ${targetLabel} — **${char.bounty.progress}/${char.bounty.goal}** — reward ${char.bounty.xpReward} XP + ${char.bounty.coinReward} coins`;
}

const FOOTER = 'Session stays live ~15 min; if buttons stop responding, run /rpg start again.';

export function buildControllerEmbed(
  world: World,
  char: Character,
  banner?: string,
  tickBanner?: string,
  screen: CtlScreen = 'world',
): EmbedBuilder {
  if (screen === 'bag') {
    const parts = [...statusLines(char), '', '**Equipped**', equipLine(char), '', '**Inventory**', inventoryLines(char)];
    if (banner) parts.push('', banner);
    return new EmbedBuilder()
      .setColor(0x8e44ad)
      .setTitle(`🎒 ${char.name}'s bag`)
      .setDescription(parts.join('\n'))
      .setFooter({ text: FOOTER });
  }

  if (screen === 'nearby') {
    const near = nearbyPlayers(world, char);
    const parts = [...statusLines(char), ''];
    if (near.length === 0) {
      parts.push('👥 Nobody is within reach right now. Move closer to another adventurer to duel or trade.');
    } else {
      parts.push('👥 **Adventurers nearby** — duel or trade with anyone in reach:');
      for (const p of near) {
        parts.push(`${p.glyph} **${p.name}** — lvl ${p.level} • ${cheby(char.pos, p.pos)} tiles away`);
      }
    }
    if (banner) parts.push('', banner);
    return new EmbedBuilder()
      .setColor(0xe67e22)
      .setTitle('👥 Nearby')
      .setDescription(parts.join('\n'))
      .setFooter({ text: FOOTER });
  }

  if (screen === 'town') {
    const here = onPlaza(world, char);
    const lines = shopCatalog().map((i) => {
      const stat = i.atk ? `+${i.atk} ATK` : i.def ? `+${i.def} DEF` : i.desc ?? i.kind;
      return `${i.glyph} **${i.label}** — ${i.buy}c (${stat})`;
    });
    const parts = [...statusLines(char), '', here ? '🏪 **Plaza shop**' : '🚫 You must stand on a 🟧 plaza tile to trade.', '', ...lines];
    if (banner) parts.push('', banner);
    return new EmbedBuilder()
      .setColor(0x1abc9c)
      .setTitle('🏪 Town')
      .setDescription(parts.join('\n'))
      .setFooter({ text: FOOTER });
  }

  if (screen === 'sheet') {
    const eff = effectiveStats(char);
    const atkLine = eff.bonusAtk > 0 ? `${eff.atk} (${char.atk} +${eff.bonusAtk})` : `${eff.atk}`;
    const defLine = eff.bonusDef > 0 ? `${eff.def} (${char.def} +${eff.bonusDef})` : `${eff.def}`;
    const parts = [
      `Lvl **${char.level}** • ${char.xp} XP (next in ${xpToNext(char.xp)})`,
      `❤️ ${hpBar(char.hp, char.maxHp)} ${char.hp}/${char.maxHp}`,
      `⚔️ ATK ${atkLine}  🛡️ DEF ${defLine}  💰 ${char.coins}`,
      `☠️ Kills ${char.kills}  •  💀 Deaths ${char.deaths}  •  📍 (${char.pos[0]}, ${char.pos[1]})`,
      '',
      '**Equipped**', equipLine(char),
      '',
      '**Bounty**', bountyLine(char),
    ];
    if (banner) parts.push('', banner);
    return new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle(`${char.glyph} ${char.name}`)
      .setDescription(parts.join('\n'))
      .setFooter({ text: FOOTER });
  }

  // Default: the world / movement screen.
  const cd = attackCooldownRemainingTicks(char, world.tick);
  const prot = respawnProtectRemainingTicks(char, world.tick);
  const cdText = prot > 0 ? `🛡️ safe ${ticksToSec(prot)}s` : cd > 0 ? `⏳ ${ticksToSec(cd)}s` : '⚔️ ready';

  const tgt = adjacentTarget(world, char);
  const targetLine = tgt
    ? `🎯 ${tgt.glyph} **${tgt.name}** ${hpBar(tgt.hp, tgt.maxHp)} ${tgt.hp}/${tgt.maxHp}`
    : null;

  const viewport = renderViewport(world, char.pos, 5, char.pos);
  const parts: string[] = statusLines(char);

  // Low-HP warning is the most urgent line.
  if (char.hp > 0 && char.hp <= char.maxHp * 0.3) {
    parts.push(hasPotion(char)
      ? `⚠️ **Low HP!** Press 🧪 Potion to heal.`
      : `⚠️ **Low HP!** Retreat to the plaza (🟧) to recover.`);
  }

  const bountyGoal = bountyGoalLine(char);
  if (bountyGoal) parts.push(bountyGoal);

  if (targetLine) parts.push(targetLine);

  const guidance = guidanceLine(world, char);
  if (guidance) parts.push(guidance);

  if (onPlaza(world, char)) parts.push('🟧 You stand on the plaza — open 🏪 Town to trade.');
  if (banner) parts.push('', banner);
  if (tickBanner) parts.push(tickBanner);
  parts.push('', viewport, mapLegend());

  return new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle(`${char.glyph} ${char.name} — ${cdText}`)
    .setDescription(parts.join('\n'))
    .setFooter({ text: `(${char.pos[0]}, ${char.pos[1]}) — ${FOOTER}` });
}

type Row = ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>;

export function buildControllerRows(
  screen: CtlScreen = 'world',
  char?: Character,
  world?: World,
  walk?: { walking: boolean; speed: 1 | 2 },
): Row[] {
  const b = (id: string, label: string, style: ButtonStyle): ButtonBuilder =>
    new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style);

  const navRow = (...extra: ButtonBuilder[]): Row =>
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      b('rpg:ctl:screen:world', '🗺 World', ButtonStyle.Secondary),
      ...extra,
    );

  if (screen === 'bag') {
    const rows: Row[] = [];
    const slugs = char ? [...new Set(char.inventory)] : [];
    if (slugs.length > 0) {
      const options = slugs.slice(0, 25).map((slug) => {
        const item = ITEMS[slug];
        const n = char!.inventory.filter((s) => s === slug).length;
        return {
          label: `${item?.label ?? slug}${n > 1 ? ` ×${n}` : ''}`,
          value: slug,
          description: item?.desc?.slice(0, 90),
          emoji: item?.glyph && /\p{Extended_Pictographic}/u.test(item.glyph) ? item.glyph : undefined,
        };
      });
      rows.push(
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('rpg:ctl:bagsel')
            .setPlaceholder('Pick an item to equip / use / drop')
            .addOptions(options),
        ),
      );
    }
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        b('rpg:ctl:unequip:weapon', '🗡 Unequip weapon', ButtonStyle.Secondary),
        b('rpg:ctl:unequip:armor', '🛡 Unequip armor', ButtonStyle.Secondary),
      ),
    );
    rows.push(navRow(b('rpg:ctl:exit', '🚪 Exit', ButtonStyle.Secondary)));
    return rows;
  }

  if (screen === 'town') {
    const rows: Row[] = [];
    const onHere = char && world ? onPlaza(world, char) : false;

    if (onHere) {
      rows.push(
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('rpg:ctl:buysel')
            .setPlaceholder('Buy an item…')
            .addOptions(
              shopCatalog().slice(0, 25).map((i) => ({
                label: `${i.label} — ${i.buy}c`,
                value: i.slug,
                description: (i.atk ? `+${i.atk} ATK` : i.def ? `+${i.def} DEF` : i.desc)?.slice(0, 90),
                emoji: i.glyph && /\p{Extended_Pictographic}/u.test(i.glyph) ? i.glyph : undefined,
              })),
            ),
        ),
      );
      const sellable = char ? [...new Set(char.inventory)].filter((s) => s !== char.equipment.weapon && s !== char.equipment.armor) : [];
      if (sellable.length > 0) {
        rows.push(
          new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId('rpg:ctl:sellsel')
              .setPlaceholder('Sell an item…')
              .addOptions(
                sellable.slice(0, 25).map((slug) => {
                  const item = ITEMS[slug];
                  return {
                    label: `${item?.label ?? slug} — ${item?.sell ?? 0}c`,
                    value: slug,
                    emoji: item?.glyph && /\p{Extended_Pictographic}/u.test(item.glyph) ? item.glyph : undefined,
                  };
                }),
              ),
          ),
        );
      }
    }
    rows.push(navRow(b('rpg:ctl:exit', '🚪 Exit', ButtonStyle.Secondary)));
    return rows;
  }

  if (screen === 'sheet') {
    return [navRow(
      b('rpg:ctl:bounty', '🎯 Reroll bounty', ButtonStyle.Primary),
      b('rpg:ctl:exit', '🚪 Exit', ButtonStyle.Secondary),
    )];
  }

  if (screen === 'nearby') {
    const rows: Row[] = [];
    const near = char && world ? nearbyPlayers(world, char) : [];
    // One row per nearby player: their name + Duel + Trade.
    for (const p of near.slice(0, 4)) {
      rows.push(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          b(`rpg:ctl:noop:${p.userId}`, `${p.glyph} ${p.name}`.slice(0, 80), ButtonStyle.Secondary).setDisabled(true),
          b(`rpg:ctl:duel:${p.userId}`, '⚔ Duel', ButtonStyle.Danger),
          b(`rpg:ctl:trade:${p.userId}`, '🤝 Trade', ButtonStyle.Success),
        ),
      );
    }
    rows.push(navRow(b('rpg:ctl:exit', '🚪 Exit', ButtonStyle.Secondary)));
    return rows;
  }

  // Default: world / movement screen — buttons reflect what's actually possible.
  const canAttack = !!world && !!char && hasAdjacentMob(world, char) && respawnProtectRemainingTicks(char, world.tick) <= 0;
  const potion = !!char && hasPotion(char);
  const hurt = !!char && char.hp < char.maxHp;
  const onLoot = !!world && !!char && lootAt(world, char.pos[0], char.pos[1]) !== null;
  const someoneNear = !!world && !!char && nearbyPlayers(world, char).length > 0;

  const attackBtn = b('rpg:ctl:attack', '⚔ Attack', canAttack ? ButtonStyle.Success : ButtonStyle.Danger)
    .setDisabled(!canAttack);
  const potionBtn = b('rpg:ctl:use', '🧪 Potion', ButtonStyle.Success)
    .setDisabled(!(potion && hurt));
  const pickupBtn = b('rpg:ctl:pickup', '💰 Pickup', ButtonStyle.Primary)
    .setDisabled(!onLoot);

  const walking = walk?.walking ?? false;
  const speed = walk?.speed ?? 1;

  // Row 1: the four direction arrows (flat) plus Stop. Pressing an arrow starts
  // walking that way; you keep moving one tile at a time until you Stop, change
  // direction, or hit a wall/enemy.
  const stopBtn = b('rpg:ctl:stop', '⏹ Stop', ButtonStyle.Danger).setDisabled(!walking);
  const moveRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    b('rpg:ctl:move:n', '⬆', ButtonStyle.Secondary),
    b('rpg:ctl:move:s', '⬇', ButtonStyle.Secondary),
    b('rpg:ctl:move:w', '⬅', ButtonStyle.Secondary),
    b('rpg:ctl:move:e', '➡', ButtonStyle.Secondary),
    stopBtn,
  );

  // Row 2: world actions + speed toggle (Discord caps a row at 5 buttons, so
  // the speed toggle lives here rather than on the movement row).
  const speedBtn = b('rpg:ctl:speed', `⏱ ${speed}x`, ButtonStyle.Secondary);
  const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    attackBtn,
    b('rpg:ctl:approach', '🏃 Approach', ButtonStyle.Primary),
    potionBtn,
    pickupBtn,
    speedBtn,
  );

  // Row 3: screen navigation. The 👥 Nearby button appears only when another
  // adventurer is within reach to duel or trade.
  const navButtons: ButtonBuilder[] = [
    b('rpg:ctl:screen:bag', '🎒 Bag', ButtonStyle.Primary),
    b('rpg:ctl:screen:town', '🏪 Town', ButtonStyle.Primary),
    b('rpg:ctl:screen:sheet', '📋 Me', ButtonStyle.Primary),
  ];
  if (someoneNear) navButtons.push(b('rpg:ctl:screen:nearby', '👥 Nearby', ButtonStyle.Success));
  navButtons.push(b('rpg:ctl:exit', '🚪 Exit', ButtonStyle.Secondary));

  return [
    moveRow,
    actionRow,
    new ActionRowBuilder<ButtonBuilder>().addComponents(...navButtons),
  ];
}

