import {
  Character,
  Encounter,
  MOB_KINDS,
  World,
  crier,
  effectiveStats,
  levelFor,
} from './world.ts';
import { ITEMS } from './items.ts';
import { BountyClaim, onKill } from './bounty.ts';

// Encounter combat is turn-based and location-based (no tiles). Each "round" the
// player swings at the encounter mob; if it survives, it swings back.

export interface KillResult {
  xp: number;
  coins: number;
  drops: string[];
  leveledUp: boolean;
  newLevel?: number;
  bounty?: BountyClaim | null;
}

export interface RoundResult {
  playerLog: string;
  mobLog?: string;
  kill?: KillResult | null;
  died?: boolean;
}

function roll(sides: number): number {
  return 1 + Math.floor(Math.random() * sides);
}

function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function computeHit(atk: number, def: number): { hit: boolean; crit: boolean; damage: number } {
  const d20 = roll(20);
  if (d20 === 1) return { hit: false, crit: false, damage: 0 };
  const total = d20 + atk;
  const dc = 10 + def;
  const hit = d20 === 20 || total >= dc;
  if (!hit) return { hit: false, crit: false, damage: 0 };
  const base = roll(6) + atk;
  const damage = d20 === 20 ? base * 2 : base;
  return { hit: true, crit: d20 === 20, damage };
}

// Start an encounter against a mob kind (sets char.encounter).
export function startEncounter(char: Character, mobKind: string): void {
  const kind = MOB_KINDS[mobKind];
  char.encounter = { mobKind, mobHp: kind?.hp ?? 1, log: [] };
}

// Resolve one combat round: the player attacks the encounter mob, then the mob
// counter-attacks if it survives. Mutates char/encounter and may award a kill or
// kill the player.
export function fightRound(world: World, char: Character): RoundResult {
  const enc = char.encounter;
  if (!enc) return { playerLog: 'No foe to fight.' };
  const kind = MOB_KINDS[enc.mobKind];
  const glyph = kind?.glyph ?? '👹';
  const name = kind?.name ?? enc.mobKind;
  const eff = effectiveStats(char);

  // Player swing.
  const a = computeHit(eff.atk, kind?.def ?? 0);
  let playerLog: string;
  if (a.hit) {
    enc.mobHp -= a.damage;
    playerLog = `${char.glyph} You hit the ${glyph} ${name} for **${a.damage}**${a.crit ? ' 💥 crit!' : ''}`;
  } else {
    playerLog = `${char.glyph} You swing at the ${glyph} ${name} — miss.`;
  }

  if (enc.mobHp <= 0) {
    const kill = awardKill(world, char, enc.mobKind);
    char.encounter = null;
    return { playerLog, kill };
  }

  // Mob counter.
  const c = computeHit(kind?.atk ?? 1, eff.def);
  let mobLog: string;
  if (c.hit) {
    char.hp -= c.damage;
    mobLog = `${glyph} The ${name} strikes you for **${c.damage}**${c.crit ? ' 💥 crit!' : ''}`;
  } else {
    mobLog = `${glyph} The ${name} lunges — miss.`;
  }

  if (char.hp <= 0) {
    handleDeath(world, char);
    return { playerLog, mobLog, died: true };
  }
  return { playerLog, mobLog };
}

// Flee an encounter. Returns true if you got away, false if the mob gets a
// parting shot (and may down you).
export function fleeEncounter(world: World, char: Character): { escaped: boolean; log: string; died?: boolean } {
  const enc = char.encounter;
  if (!enc) return { escaped: true, log: 'There is nothing to flee.' };
  const kind = MOB_KINDS[enc.mobKind];
  char.encounter = null;
  // 70% clean getaway; otherwise a parting hit.
  if (Math.random() < 0.7) {
    return { escaped: true, log: '🏃 You slip away to safety.' };
  }
  const eff = effectiveStats(char);
  const c = computeHit(kind?.atk ?? 1, eff.def);
  if (c.hit) {
    char.hp -= c.damage;
    if (char.hp <= 0) {
      handleDeath(world, char);
      return { escaped: true, log: `🏃 You flee, but the ${kind?.name ?? 'foe'} fells you as you turn!`, died: true };
    }
    return { escaped: true, log: `🏃 You flee — the ${kind?.name ?? 'foe'} catches you for **${c.damage}** on the way out.` };
  }
  return { escaped: true, log: '🏃 You break away, narrowly dodging a parting blow.' };
}

function awardKill(world: World, char: Character, mobKind: string): KillResult {
  const kind = MOB_KINDS[mobKind];
  if (!kind) return { xp: 0, coins: 0, drops: [], leveledUp: false };

  const coins = randInt(kind.coins[0], kind.coins[1]);
  const drops: string[] = [];
  for (const entry of kind.loot) {
    if (Math.random() < entry.chance) drops.push(entry.item);
  }
  // Loot goes straight to the bag, coins to the wallet (no tiles to walk over).
  for (const item of drops) char.inventory.push(item);
  char.coins += coins;
  char.kills++;

  const beforeLevel = levelFor(char.xp);
  char.xp += kind.xp;
  const afterLevel = levelFor(char.xp);
  const leveledUp = afterLevel > beforeLevel;
  if (leveledUp) {
    const gained = afterLevel - beforeLevel;
    char.level = afterLevel;
    char.maxHp += 4 * gained;
    char.atk += 1 * gained;
    char.def += 1 * gained;
    char.hp = char.maxHp;
    crier(world, `✨ ${char.glyph} **${char.name}** reached level **${afterLevel}**!`);
  }

  if (kind.slug === 'troll') {
    crier(world, `🧌 ${char.glyph} **${char.name}** felled a **Troll**!`);
  }
  for (const item of drops) {
    if (item === 'greatsword') {
      crier(world, `🪓 ${char.glyph} **${char.name}** found a **${ITEMS[item]?.label ?? item}**!`);
    }
  }

  const bounty = onKill(char, kind.slug);
  return { xp: kind.xp, coins, drops, leveledUp, newLevel: leveledUp ? afterLevel : undefined, bounty };
}

function handleDeath(world: World, char: Character): void {
  char.deaths++;
  crier(world, `💀 ${char.glyph} **${char.name}** fell in the wild and was carried back to the plaza.`);
  char.hp = char.maxHp;
  char.encounter = null;
  // Drop half their coins as the cost of defeat.
  const dropped = Math.floor(char.coins / 2);
  char.coins -= dropped;
  // Wake up safe at the hub.
  char.locationId = 'plaza';
}
