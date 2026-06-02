import {
  Character,
  Mob,
  MOB_KINDS,
  MobKind,
  World,
  cheby,
  entityAt,
  findOpenCell,
  isWalkable,
  nextId,
  terrainAt,
} from './world.ts';
import { mobAttackChar } from './combat.ts';

const MOB_TARGET_DENSITY = 0.0025; // mobs per cell
const MOB_CAP_MIN = 6;
const EVOLVE_INTERVAL_TICKS = 120; // ~6s at 20 TPS
const TICK_EVENT_CAP = 12;

// ── Conway-inspired population rules ─────────────────────────────────────────
// Mobs are the "life". Each evolution step we count, for every mob, how many
// other mobs sit within NEIGHBOR_RADIUS (Chebyshev). The classic Life intuition
// is mapped to creatures rather than pixels and tuned for a playable world:
//   • A comfortable neighbourhood SURVIVES and may BREED into a nearby cell.
//   • Too many neighbours STARVE (overcrowding death).
//   • Lone, isolated creatures may die out for lack of breeding pressure.
// Hard guards below ensure the world never overpopulates nor goes extinct,
// regardless of what the raw rules would do on a given step.
const NEIGHBOR_RADIUS = 4;
const CROWD_DEATH = 4;   // ≥ this many neighbours → starves
const BREED_MIN = 2;     // breeds when neighbours are in [BREED_MIN, BREED_MAX]
const BREED_MAX = 3;
const LONELY_DEATH_CHANCE = 0.15; // isolated (0 neighbours) mobs sometimes fade

export interface TickEvent {
  log: string;
}

// Advance the world by exactly one tick (50ms of sim time). Driven by the
// background engine while a guild has active players. Returns events that
// happened this tick — callers can choose whether to surface them.
export function tickWorld(world: World): TickEvent[] {
  world.tick++;
  const now = world.tick;
  const events: TickEvent[] = [];

  evolveMobs(world, now, events);
  stepMobs(world, now, events);

  return events.slice(0, TICK_EVENT_CAP);
}

function mobCap(world: World): number {
  const playerCount = Math.max(1, Object.values(world.chars).length);
  const fromArea = Math.floor(world.width * world.height * MOB_TARGET_DENSITY);
  return Math.max(MOB_CAP_MIN, fromArea + playerCount * 2);
}

// Population floor: never let the world drop so low it feels empty.
function mobFloor(world: World): number {
  return Math.max(MOB_CAP_MIN, Math.floor(mobCap(world) * 0.5));
}

// Count neighbouring mobs within NEIGHBOR_RADIUS for a given position
// (excluding the mob at that position via its id).
function countMobNeighbors(
  mobs: Mob[],
  pos: [number, number],
  selfId: string | null,
): number {
  let n = 0;
  for (const m of mobs) {
    if (m.id === selfId) continue;
    if (cheby(pos, m.pos) <= NEIGHBOR_RADIUS) n++;
  }
  return n;
}

// The Conway-style evolution step: deaths from crowding/isolation, births in
// fertile (right-neighbour-count) cells, then guards for floor and ceiling.
function evolveMobs(world: World, now: number, events: TickEvent[]): void {
  if (now - world.lastSpawnAt < EVOLVE_INTERVAL_TICKS) return;
  world.lastSpawnAt = now;

  const mobs = Object.values(world.mobs);
  const cap = mobCap(world);
  const floor = mobFloor(world);

  // 1. Deaths — overcrowding starves; loneliness occasionally fades. Snapshot
  //    neighbour counts first so deaths within a step don't cascade.
  const counts = new Map<string, number>();
  for (const m of mobs) counts.set(m.id, countMobNeighbors(mobs, m.pos, m.id));

  let died = 0;
  for (const m of mobs) {
    const n = counts.get(m.id) ?? 0;
    const crowded = n >= CROWD_DEATH;
    const lonely = n === 0 && Math.random() < LONELY_DEATH_CHANCE;
    // Don't let rule-deaths drive us below the floor — the guard handles scarcity.
    if ((crowded || lonely) && Object.keys(world.mobs).length > floor) {
      delete world.mobs[m.id];
      died++;
    }
  }

  // 2. Births — fertile empty cells (a comfortable neighbour count) spawn life,
  //    up to the ceiling. Birth kind/level still follows the existing weighting.
  const present = Object.values(world.mobs);
  let born = 0;
  const room = cap - present.length;
  // Sample candidate empty cells; those with the right neighbourhood breed.
  for (let attempt = 0; attempt < 60 && born < room; attempt++) {
    const cell = randomEmptyCell(world);
    if (!cell) break;
    const n = countMobNeighbors(present, cell, null);
    if (n < BREED_MIN || n > BREED_MAX) continue;
    if (spawnMobAt(world, cell, now)) born++;
  }

  // 3. Guard — floor. If the world thinned out below the floor (rules, or
  //    players culling mobs), reseed fertile/random cells until back to floor.
  let have = Object.keys(world.mobs).length;
  for (let attempt = 0; attempt < 80 && have < floor; attempt++) {
    const cell = randomEmptyCell(world);
    if (!cell) break;
    if (spawnMobAt(world, cell, now)) have++;
  }

  // 4. Guard — ceiling. If anything pushed us over the cap, cull the most
  //    crowded mobs first (they'd starve next step anyway).
  const over = Object.values(world.mobs);
  if (over.length > cap) {
    const ranked = over
      .map((m) => ({ m, n: countMobNeighbors(over, m.pos, m.id) }))
      .sort((a, b) => b.n - a.n);
    let excess = over.length - cap;
    for (const { m } of ranked) {
      if (excess <= 0) break;
      delete world.mobs[m.id];
      excess--;
    }
  }

  // Only surface notable churn so the tick banner doesn't narrate every step.
  if (born + died >= 3) {
    events.push({ log: `🌱 The wilds shift — ${born} born, ${died} faded.` });
  }
}

// Spawn a single mob at the given (already-validated empty) cell. Returns false
// if the kind roll fails. Kind selection keeps the player-level weighting.
function spawnMobAt(world: World, cell: [number, number], now: number): boolean {
  const kind = pickWeightedKind(world, Object.values(MOB_KINDS));
  if (!kind) return false;
  const id = nextId(world, 'mob');
  world.mobs[id] = { id, kind: kind.slug, pos: cell, hp: kind.hp, lastStepAt: now };
  return true;
}

// Bias to weaker mobs if highest player level is low, beefier ones if high.
function pickWeightedKind(world: World, kinds: MobKind[]): MobKind | null {
  const maxLevel = Math.max(1, ...Object.values(world.chars).map((c) => c.level));
  const weights = kinds.map((k) => {
    const tier = k.xp / 10;
    // Players at level N: peak weight where tier ≈ N. Falls off either side.
    const gap = Math.abs(tier - maxLevel);
    return Math.max(0.05, 1 / (1 + gap));
  });
  const sum = weights.reduce((s, w) => s + w, 0);
  let pick = Math.random() * sum;
  for (let i = 0; i < kinds.length; i++) {
    pick -= weights[i];
    if (pick <= 0) return kinds[i];
  }
  return kinds[0] ?? null;
}

function randomEmptyCell(world: World): [number, number] | null {
  for (let tries = 0; tries < 40; tries++) {
    const r = 1 + Math.floor(Math.random() * (world.height - 2));
    const c = 1 + Math.floor(Math.random() * (world.width - 2));
    if (!isWalkable(terrainAt(world, r, c))) continue;
    if (entityAt(world, r, c)) continue;
    // Don't spawn directly on a player.
    if (cheby([r, c], world.spawn) < 6) continue;
    let tooClose = false;
    for (const ch of Object.values(world.chars)) {
      if (cheby([r, c], ch.pos) < 4) { tooClose = true; break; }
    }
    if (tooClose) continue;
    return [r, c];
  }
  return null;
}

function stepMobs(world: World, now: number, events: TickEvent[]): void {
  // Away players (/rpg exit) and freshly-respawned players just exist — mobs
  // ignore them until they re-engage / their protection lapses.
  const aliveChars = Object.values(world.chars).filter(
    (c) => c.hp > 0 && !c.away && c.downUntil <= now,
  );
  if (aliveChars.length === 0) return;

  for (const mob of Object.values(world.mobs)) {
    const kind = MOB_KINDS[mob.kind];
    if (!kind) continue;
    if (now - mob.lastStepAt < kind.speedTicks) continue;
    mob.lastStepAt = now;

    const target = nearestChar(mob, aliveChars, kind.aggroRange);
    if (!target) {
      // Idle wander 1/3 of the time.
      if (Math.random() < 0.33) wander(world, mob);
      continue;
    }

    // If adjacent, attack instead of moving.
    if (cheby(mob.pos, target.pos) <= 1) {
      const res = mobAttackChar(world, mob, target);
      events.push({ log: res.log });
      continue;
    }
    stepToward(world, mob, target);
  }
}

function nearestChar(mob: Mob, chars: Character[], range: number): Character | null {
  let best: Character | null = null;
  let bestDist = Infinity;
  for (const c of chars) {
    const d = cheby(mob.pos, c.pos);
    if (d > range) continue;
    if (d < bestDist) { bestDist = d; best = c; }
  }
  return best;
}

function stepToward(world: World, mob: Mob, target: Character): void {
  const dr = Math.sign(target.pos[0] - mob.pos[0]);
  const dc = Math.sign(target.pos[1] - mob.pos[1]);
  // Try diagonal first, then primary axis, then other axis.
  const tries: [number, number][] = [
    [mob.pos[0] + dr, mob.pos[1] + dc],
    [mob.pos[0] + dr, mob.pos[1]],
    [mob.pos[0], mob.pos[1] + dc],
  ];
  for (const [r, c] of tries) {
    if (!isWalkable(terrainAt(world, r, c))) continue;
    if (entityAt(world, r, c)) continue;
    mob.pos = [r, c];
    return;
  }
}

function wander(world: World, mob: Mob): void {
  const dr = Math.floor(Math.random() * 3) - 1;
  const dc = Math.floor(Math.random() * 3) - 1;
  if (dr === 0 && dc === 0) return;
  const r = mob.pos[0] + dr;
  const c = mob.pos[1] + dc;
  if (!isWalkable(terrainAt(world, r, c))) return;
  if (entityAt(world, r, c)) return;
  mob.pos = [r, c];
}

// Convenience: also returns the open cell to use when respawning around spawn.
export { findOpenCell };
