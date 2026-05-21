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
const SPAWN_INTERVAL_MS = 6000;
const TICK_EVENT_CAP = 12;

export interface TickEvent {
  log: string;
}

// Lazily advance world simulation when anyone touches it. Returns events that
// happened since the last tick — callers can choose whether to surface them.
export function tickWorld(world: World): TickEvent[] {
  const now = Date.now();
  const events: TickEvent[] = [];

  spawnMobsIfNeeded(world, now, events);
  stepMobs(world, now, events);

  return events.slice(0, TICK_EVENT_CAP);
}

function mobCap(world: World): number {
  const playerCount = Math.max(1, Object.values(world.chars).length);
  const fromArea = Math.floor(world.width * world.height * MOB_TARGET_DENSITY);
  return Math.max(MOB_CAP_MIN, fromArea + playerCount * 2);
}

function spawnMobsIfNeeded(world: World, now: number, events: TickEvent[]): void {
  if (now - world.lastSpawnAt < SPAWN_INTERVAL_MS) return;
  world.lastSpawnAt = now;
  const cap = mobCap(world);
  const have = Object.keys(world.mobs).length;
  if (have >= cap) return;

  // Spawn 1-2 mobs per cycle until cap.
  const toSpawn = Math.min(cap - have, 1 + Math.floor(Math.random() * 2));
  const kinds = Object.values(MOB_KINDS);

  for (let i = 0; i < toSpawn; i++) {
    const kind = pickWeightedKind(world, kinds);
    if (!kind) return;
    const cell = randomEmptyCell(world);
    if (!cell) return;
    const id = nextId(world, 'mob');
    world.mobs[id] = {
      id,
      kind: kind.slug,
      pos: cell,
      hp: kind.hp,
      lastStepAt: now,
    };
    events.push({ log: `${kind.glyph} A ${kind.name.toLowerCase()} appears.` });
  }
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
  const aliveChars = Object.values(world.chars).filter((c) => c.hp > 0);
  if (aliveChars.length === 0) return;

  for (const mob of Object.values(world.mobs)) {
    const kind = MOB_KINDS[mob.kind];
    if (!kind) continue;
    if (now - mob.lastStepAt < kind.speedMs) continue;
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
