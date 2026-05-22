import { Duel, World, nextId, levelFor } from './world.ts';

const DUEL_EXPIRY_MS = 60_000;

export function startDuel(
  world: World,
  challengerId: string,
  defenderId: string,
  messageId: string,
  channelId: string,
): Duel {
  const id = nextId(world, 'duel');
  const now = new Date();
  const duel: Duel = {
    id,
    challengerId,
    defenderId,
    state: 'pending',
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + DUEL_EXPIRY_MS).toISOString(),
    messageId,
    channelId,
    log: [],
  };
  world.duels[id] = duel;
  return duel;
}

export function declineDuel(world: World, duelId: string): Duel | null {
  const duel = world.duels[duelId];
  if (!duel || duel.state !== 'pending') return null;
  duel.state = 'finished';
  return duel;
}

export function isDuelExpired(duel: Duel): boolean {
  return duel.state === 'pending' && Date.now() > new Date(duel.expiresAt).getTime();
}

function roll(sides: number): number {
  return 1 + Math.floor(Math.random() * sides);
}

interface SwingResult {
  hit: boolean;
  crit: boolean;
  damage: number;
}

function resolveSwing(atk: number, def: number): SwingResult {
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

export interface DuelRunResult {
  winnerId: string;
  loserId: string;
  xpAwarded: number;
  log: string[];
}

export function runDuel(world: World, duelId: string): DuelRunResult | null {
  const duel = world.duels[duelId];
  if (!duel || duel.state !== 'active') return null;

  const a = world.chars[duel.challengerId];
  const b = world.chars[duel.defenderId];
  if (!a || !b) {
    duel.state = 'finished';
    return null;
  }

  // Snapshot HP so the real chars aren't permanently damaged.
  let aHp = a.maxHp;
  let bHp = b.maxHp;
  const MAX_ROUNDS = 30;

  for (let round = 0; round < MAX_ROUNDS && aHp > 0 && bHp > 0; round++) {
    // a attacks b
    const aSwing = resolveSwing(a.atk, b.def);
    if (aSwing.hit) {
      bHp -= aSwing.damage;
      duel.log.push(
        `${a.glyph} **${a.name}** hits ${b.glyph} **${b.name}** for **${aSwing.damage}**${aSwing.crit ? ' 💥 crit!' : ''} (${Math.max(0, bHp)} HP left)`,
      );
    } else {
      duel.log.push(`${a.glyph} **${a.name}** swings at ${b.glyph} **${b.name}** — miss.`);
    }
    if (bHp <= 0) break;

    // b attacks a
    const bSwing = resolveSwing(b.atk, a.def);
    if (bSwing.hit) {
      aHp -= bSwing.damage;
      duel.log.push(
        `${b.glyph} **${b.name}** hits ${a.glyph} **${a.name}** for **${bSwing.damage}**${bSwing.crit ? ' 💥 crit!' : ''} (${Math.max(0, aHp)} HP left)`,
      );
    } else {
      duel.log.push(`${b.glyph} **${b.name}** swings at ${a.glyph} **${a.name}** — miss.`);
    }
  }

  // Determine winner by who has more HP remaining (or by coin flip if tied).
  const aWins = aHp > bHp || (aHp === bHp && Math.random() < 0.5);
  const winner = aWins ? a : b;
  const loser = aWins ? b : a;

  const xp = Math.max(1, Math.floor(levelFor(loser.xp) * 5 * 0.1));
  winner.xp += xp;
  // Check for level up (matching existing combat.ts pattern).
  const beforeLevel = levelFor(winner.xp - xp);
  const afterLevel = levelFor(winner.xp);
  if (afterLevel > beforeLevel) {
    const gained = afterLevel - beforeLevel;
    winner.level = afterLevel;
    winner.maxHp += 4 * gained;
    winner.atk += 1 * gained;
    winner.def += 1 * gained;
    winner.hp = winner.maxHp;
    duel.log.push(`✨ **Level up!** ${winner.name} is now level ${winner.level}.`);
  }

  duel.state = 'finished';
  return {
    winnerId: winner.userId,
    loserId: loser.userId,
    xpAwarded: xp,
    log: duel.log,
  };
}
