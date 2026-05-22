import {
  Character,
  Mob,
  MOB_KINDS,
  World,
  cheby,
  effectiveStats,
  findOpenCell,
  levelFor,
  nextId,
} from './world.ts';
import { BountyClaim, onKill } from './bounty.ts';

export const ATTACK_COOLDOWN_MS = 3000;

export interface AttackResult {
  attacker: string;
  target: string;
  hit: boolean;
  damage: number;
  crit: boolean;
  miss: boolean;
  log: string;
}

export interface KillResult {
  xp: number;
  coins: number;
  drops: string[];
  leveledUp: boolean;
  newLevel?: number;
  bounty?: BountyClaim | null;
}

function roll(sides: number): number {
  return 1 + Math.floor(Math.random() * sides);
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

// Character attacks mob. Returns null if mob is out of reach. Caller must
// already have verified the cooldown.
export function charAttackMob(
  world: World,
  char: Character,
  mob: Mob,
): { attack: AttackResult; counter: AttackResult | null; kill: KillResult | null } | null {
  if (cheby(char.pos, mob.pos) > 1) return null;

  const kind = MOB_KINDS[mob.kind];
  const def = kind?.def ?? 0;
  const eff = effectiveStats(char);
  const res = computeHit(eff.atk, def);
  const attack: AttackResult = {
    attacker: char.name,
    target: kind?.name ?? mob.kind,
    hit: res.hit,
    damage: res.damage,
    crit: res.crit,
    miss: !res.hit,
    log: res.hit
      ? `${char.glyph} **${char.name}** hits ${kind?.glyph ?? '👹'} ${kind?.name ?? mob.kind} for **${res.damage}**${res.crit ? ' 💥 crit!' : ''}`
      : `${char.glyph} **${char.name}** swings at ${kind?.glyph ?? '👹'} ${kind?.name ?? mob.kind} — miss.`,
  };
  char.lastAttackAt = Date.now();
  if (res.hit) mob.hp -= res.damage;

  if (mob.hp <= 0) {
    const kill = killMob(world, char, mob);
    return { attack, counter: null, kill };
  }

  // Counter-attack from the mob.
  const counterRes = computeHit(kind?.atk ?? 1, eff.def);
  const counter: AttackResult = {
    attacker: kind?.name ?? mob.kind,
    target: char.name,
    hit: counterRes.hit,
    damage: counterRes.damage,
    crit: counterRes.crit,
    miss: !counterRes.hit,
    log: counterRes.hit
      ? `${kind?.glyph ?? '👹'} **${kind?.name ?? mob.kind}** strikes ${char.glyph} ${char.name} for **${counterRes.damage}**${counterRes.crit ? ' 💥 crit!' : ''}`
      : `${kind?.glyph ?? '👹'} **${kind?.name ?? mob.kind}** lunges at ${char.glyph} ${char.name} — miss.`,
  };
  if (counterRes.hit) char.hp -= counterRes.damage;

  if (char.hp <= 0) handleDeath(world, char);

  return { attack, counter, kill: null };
}

// Mob attacks a character. Used by the tick step.
export function mobAttackChar(world: World, mob: Mob, char: Character): AttackResult {
  const kind = MOB_KINDS[mob.kind];
  const eff = effectiveStats(char);
  const res = computeHit(kind?.atk ?? 1, eff.def);
  if (res.hit) char.hp -= res.damage;
  const log = res.hit
    ? `${kind?.glyph ?? '👹'} **${kind?.name ?? mob.kind}** strikes ${char.glyph} ${char.name} for **${res.damage}**${res.crit ? ' 💥 crit!' : ''}`
    : `${kind?.glyph ?? '👹'} **${kind?.name ?? mob.kind}** swings at ${char.glyph} ${char.name} — miss.`;
  if (char.hp <= 0) handleDeath(world, char);
  return {
    attacker: kind?.name ?? mob.kind,
    target: char.name,
    hit: res.hit,
    damage: res.damage,
    crit: res.crit,
    miss: !res.hit,
    log,
  };
}

function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function killMob(world: World, char: Character, mob: Mob): KillResult {
  const kind = MOB_KINDS[mob.kind];
  delete world.mobs[mob.id];
  if (!kind) return { xp: 0, coins: 0, drops: [], leveledUp: false };

  const coins = randInt(kind.coins[0], kind.coins[1]);
  const drops: string[] = [];
  for (const entry of kind.loot) {
    if (Math.random() < entry.chance) drops.push(entry.item);
  }
  // Drop loot as a tile right where the mob fell.
  for (const item of drops) {
    const id = nextId(world, 'loot');
    world.loot[id] = { id, item, pos: [mob.pos[0], mob.pos[1]] };
  }
  // Coins go straight to the wallet (no need to walk over them).
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
    char.hp = char.maxHp; // full heal on level up
  }

  const bounty = onKill(char, kind.slug);

  return {
    xp: kind.xp,
    coins,
    drops,
    leveledUp,
    newLevel: leveledUp ? afterLevel : undefined,
    bounty,
  };
}

function handleDeath(world: World, char: Character): void {
  char.deaths++;
  char.hp = char.maxHp;
  // Drop half their coins as loot on the death tile.
  const dropped = Math.floor(char.coins / 2);
  if (dropped > 0) {
    char.coins -= dropped;
    const id = nextId(world, 'loot');
    world.loot[id] = { id, item: `${dropped}-coins`, pos: [char.pos[0], char.pos[1]] };
  }
  // Respawn at a clear cell near the world spawn.
  const cell = findOpenCell(world, world.spawn, 8) ?? world.spawn;
  char.pos = cell;
}

export function attackCooldownRemainingMs(char: Character): number {
  return Math.max(0, ATTACK_COOLDOWN_MS - (Date.now() - char.lastAttackAt));
}
