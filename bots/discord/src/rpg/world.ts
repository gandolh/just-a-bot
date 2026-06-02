import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ITEMS } from './items.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const dataDir = resolve(here, '../../data/rpg');

export type Terrain = '.' | '#' | '~' | 'f' | '^' | '=';

export interface Equipment {
  weapon: string | null;
  armor: string | null;
}

export interface Bounty {
  target: string;
  goal: number;
  progress: number;
  xpReward: number;
  coinReward: number;
  rolledAt: string;
}

// A transient combat encounter the player is currently in (not tile-based).
export interface Encounter {
  mobKind: string;   // MOB_KINDS slug
  mobHp: number;
  log: string[];     // recent swing lines
}

export interface Character {
  userId: string;
  name: string;
  glyph: string;
  // Current named location (see locations.ts). Replaces tile position.
  locationId: string;
  // Active explore-combat encounter, if any.
  encounter: Encounter | null;
  // Legacy tile position — retained for backward-compat on load; unused by the
  // location model.
  pos?: [number, number];
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  level: number;
  xp: number;
  coins: number;
  kills: number;
  deaths: number;
  inventory: string[];
  equipment: Equipment;
  bounty: Bounty | null;
  // World-tick of the last attack / last move (see world.tick).
  lastAttackAt: number;
  lastMoveAt: number;
  // When true the player has exited the controller: they still exist in the
  // world but cannot be targeted by mobs and do not block movement.
  away: boolean;
  // World-tick until which a freshly-respawned player is protected: they cannot
  // be targeted by mobs and cannot attack. 0 means not protected.
  downUntil: number;
}

export interface MobKind {
  slug: string;
  name: string;
  glyph: string;
  hp: number;
  atk: number;
  def: number;
  xp: number;
  coins: [number, number];
  loot: { item: string; chance: number }[];
  // Minimum ticks between this mob's steps (≥ 1 — a mob never acts more than
  // once per tick). See TICKS_PER_SECOND.
  speedTicks: number;
  aggroRange: number;
}

export interface Mob {
  id: string;
  kind: string;
  pos: [number, number];
  hp: number;
  // World-tick of this mob's last step.
  lastStepAt: number;
}

export interface Loot {
  id: string;
  item: string;
  pos: [number, number];
}

export interface Duel {
  id: string;
  challengerId: string;
  defenderId: string;
  state: 'pending' | 'active' | 'finished';
  createdAt: string;
  expiresAt: string;
  messageId: string;
  channelId: string;
  log: string[];
}

export interface TradeOffer {
  coins: number;
  items: string[];
}

export interface Trade {
  id: string;
  aId: string;
  bId: string;
  aOffer: TradeOffer;
  bOffer: TradeOffer;
  aConfirmed: boolean;
  bConfirmed: boolean;
  state: 'open' | 'completed' | 'cancelled';
  messageId: string;
  channelId: string;
}

export interface World {
  guildId: string;
  width: number;
  height: number;
  grid: string[];
  spawn: [number, number];
  chars: Record<string, Character>;
  mobs: Record<string, Mob>;
  loot: Record<string, Loot>;
  duels: Record<string, Duel>;
  trades: Record<string, Trade>;
  nextId: number;
  // World-tick of the last population-evolution step.
  lastSpawnAt: number;
  // Monotonic simulation clock. Advances one per engine tick while the guild has
  // active players; frozen otherwise. All other *At fields are in this unit.
  tick: number;
  updatedAt: string;
  // Town crier: where to announce notable events, and the pending queue.
  crierChannelId: string | null;
  crierQueue: string[];
}

// One tick is one second — the natural beat of this grid game (a normal move
// takes one tick). The whole sim, walk cadence, and render all run on this one
// clock; there is deliberately no sub-second resolution.
export const MS_PER_TICK = 1000;
// Seconds-per-tick is 1, so "ticks" and "seconds" are interchangeable here.
export const TICKS_PER_SECOND = 1;

export const MOB_KINDS: Record<string, MobKind> = {
  slime: {
    slug: 'slime',
    name: 'Slime',
    glyph: '🟢',
    hp: 8, atk: 2, def: 0, xp: 5,
    coins: [0, 2],
    loot: [{ item: 'slime-jelly', chance: 0.3 }],
    speedTicks: 5,
    aggroRange: 3,
  },
  goblin: {
    slug: 'goblin',
    name: 'Goblin',
    glyph: '👺',
    hp: 14, atk: 4, def: 1, xp: 12,
    coins: [1, 5],
    loot: [
      { item: 'rusty-dagger', chance: 0.2 },
      { item: 'healing-potion', chance: 0.15 },
    ],
    speedTicks: 4,
    aggroRange: 5,
  },
  wolf: {
    slug: 'wolf',
    name: 'Wolf',
    glyph: '🐺',
    hp: 18, atk: 5, def: 1, xp: 18,
    coins: [0, 3],
    loot: [{ item: 'wolf-pelt', chance: 0.4 }],
    speedTicks: 3,
    aggroRange: 6,
  },
  bandit: {
    slug: 'bandit',
    name: 'Bandit',
    glyph: '🗡️',
    hp: 22, atk: 6, def: 2, xp: 25,
    coins: [3, 12],
    loot: [
      { item: 'healing-potion', chance: 0.25 },
      { item: 'leather-armor', chance: 0.1 },
    ],
    speedTicks: 4,
    aggroRange: 5,
  },
  orc: {
    slug: 'orc',
    name: 'Orc',
    glyph: '👹',
    hp: 32, atk: 8, def: 3, xp: 40,
    coins: [4, 15],
    loot: [
      { item: 'iron-sword', chance: 0.15 },
      { item: 'healing-potion', chance: 0.3 },
    ],
    speedTicks: 4,
    aggroRange: 5,
  },
  troll: {
    slug: 'troll',
    name: 'Troll',
    glyph: '🧌',
    hp: 60, atk: 12, def: 4, xp: 100,
    coins: [10, 40],
    loot: [
      { item: 'troll-tooth', chance: 0.6 },
      { item: 'greatsword', chance: 0.1 },
    ],
    speedTicks: 5,
    aggroRange: 4,
  },
};

const cache = new Map<string, World>();
const writeChains = new Map<string, Promise<void>>();

// Debounced persistence. The in-memory cache is always authoritative, so reads
// never see stale data even before a write lands. Disk writes for a guild are
// coalesced to at most one per DEBOUNCE_MS — navigation (frequent, low-stakes)
// rides this; important actions force an immediate flush.
const DEBOUNCE_MS = 2500;
const dirty = new Set<string>();
const flushTimers = new Map<string, NodeJS.Timeout>();

// The data directory is created once, not on every write.
let dataDirReady: Promise<void> | null = null;
function ensureDataDir(): Promise<void> {
  if (!dataDirReady) dataDirReady = mkdir(dataDir, { recursive: true }).then(() => undefined);
  return dataDirReady;
}

function pathFor(guildId: string): string {
  return resolve(dataDir, `${guildId}.json`);
}

// Serialize the current cached world for a guild to disk, chained so concurrent
// flushes for the same guild never interleave.
function flush(guildId: string): Promise<void> {
  const world = cache.get(guildId);
  if (!world) return Promise.resolve();
  dirty.delete(guildId);
  const timer = flushTimers.get(guildId);
  if (timer) { clearTimeout(timer); flushTimers.delete(guildId); }

  const snapshot = JSON.stringify(world);
  const prev = writeChains.get(guildId) ?? Promise.resolve();
  const next = prev.then(async () => {
    await ensureDataDir();
    await writeFile(pathFor(guildId), snapshot, 'utf8');
  });
  writeChains.set(guildId, next);
  return next;
}

// Mark a guild's world dirty and schedule a debounced flush. Exported so the
// engine (which mutates the cached world directly each tick) can request a
// periodic snapshot without writing on every tick.
export function markDirty(guildId: string): void {
  scheduleFlush(guildId);
}

// Mark a guild's world dirty and schedule a debounced flush.
function scheduleFlush(guildId: string): void {
  dirty.add(guildId);
  if (flushTimers.has(guildId)) return;
  const timer = setTimeout(() => {
    flushTimers.delete(guildId);
    if (dirty.has(guildId)) void flush(guildId);
  }, DEBOUNCE_MS);
  // Don't keep the process alive solely for a pending save.
  if (typeof timer.unref === 'function') timer.unref();
  flushTimers.set(guildId, timer);
}

// Flush every dirty world now — called on shutdown so the last debounce window
// isn't lost.
export async function flushAllWorlds(): Promise<void> {
  await Promise.all([...dirty].map((g) => flush(g)));
}

// Force an immediate flush for one guild — used when an action that started as
// debounced navigation turns out to matter (e.g. a mob killed the player on the
// tick of a move press).
export async function flushWorld(guildId: string): Promise<void> {
  await flush(guildId);
}

let shutdownHooked = false;
function hookShutdown(): void {
  if (shutdownHooked) return;
  shutdownHooked = true;
  const onExit = () => { void flushAllWorlds(); };
  process.once('SIGINT', onExit);
  process.once('SIGTERM', onExit);
  process.once('beforeExit', onExit);
}

export async function loadWorld(guildId: string): Promise<World | null> {
  if (cache.has(guildId)) return cache.get(guildId)!;
  try {
    const raw = await readFile(pathFor(guildId), 'utf8');
    const world = JSON.parse(raw) as World;
    // Backward-compat defaults for fields added after initial release.
    world.duels ??= {};
    world.trades ??= {};
    world.crierChannelId ??= null;
    world.crierQueue ??= [];
    world.tick ??= 0;
    for (const c of Object.values(world.chars)) {
      c.equipment ??= { weapon: null, armor: null };
      if (c.bounty === undefined) c.bounty = null;
      c.away ??= false;
      c.downUntil ??= 0;
      c.locationId ??= 'plaza';
      if (c.encounter === undefined) c.encounter = null;
    }
    cache.set(guildId, world);
    return world;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

async function persist(guildId: string, world: World): Promise<void> {
  world.updatedAt = new Date().toISOString();
  cache.set(guildId, world);
  await flush(guildId);
}

export async function updateWorld(
  guildId: string,
  mutate: (world: World) => void | Promise<void>,
  opts?: { urgent?: boolean },
): Promise<World> {
  hookShutdown();
  let world = await loadWorld(guildId);
  if (!world) world = await getOrCreateWorld(guildId);
  await mutate(world);
  world.updatedAt = new Date().toISOString();
  cache.set(guildId, world);
  // Important actions persist immediately; everything else (movement, browsing)
  // is debounced so the controller can re-render without waiting on disk.
  if (opts?.urgent) await flush(guildId);
  else scheduleFlush(guildId);
  return world;
}

// Drain every cached world's crier queue. Returns the channel + lines to post
// and clears the queues (persisting the cleared state). The caller does the
// actual Discord I/O so this module stays free of the client.
export async function drainCrierQueues(): Promise<
  { guildId: string; channelId: string; lines: string[] }[]
> {
  const out: { guildId: string; channelId: string; lines: string[] }[] = [];
  for (const [guildId, world] of cache) {
    if (!world.crierChannelId) continue;
    if (!world.crierQueue || world.crierQueue.length === 0) continue;
    out.push({ guildId, channelId: world.crierChannelId, lines: [...world.crierQueue] });
    world.crierQueue = [];
    await persist(guildId, world);
  }
  return out;
}

export async function getOrCreateWorld(guildId: string): Promise<World> {
  const existing = await loadWorld(guildId);
  if (existing) return existing;
  const world = generateWorld(guildId, 60, 40);
  await persist(guildId, world);
  return world;
}

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function generateWorld(guildId: string, width: number, height: number): World {
  const rand = rng(hashSeed(guildId));
  const grid: string[] = [];
  for (let r = 0; r < height; r++) {
    let row = '';
    for (let c = 0; c < width; c++) {
      const onEdge = r === 0 || c === 0 || r === height - 1 || c === width - 1;
      if (onEdge) { row += '#'; continue; }
      const n = rand();
      if (n < 0.04) row += '^';
      else if (n < 0.10) row += '~';
      else if (n < 0.22) row += 'f';
      else if (n < 0.24) row += '#';
      else row += '.';
    }
    grid.push(row);
  }
  // Carve a central spawn plaza so players don't appear in a wall.
  const sr = Math.floor(height / 2);
  const sc = Math.floor(width / 2);
  for (let dr = -2; dr <= 2; dr++) {
    for (let dc = -2; dc <= 2; dc++) {
      const r = sr + dr;
      const c = sc + dc;
      grid[r] = grid[r].slice(0, c) + '=' + grid[r].slice(c + 1);
    }
  }
  return {
    guildId,
    width,
    height,
    grid,
    spawn: [sr, sc],
    chars: {},
    mobs: {},
    loot: {},
    duels: {},
    trades: {},
    nextId: 1,
    lastSpawnAt: 0,
    tick: 0,
    updatedAt: new Date().toISOString(),
    crierChannelId: null,
    crierQueue: [],
  };
}

// Push a notable event to the town-crier queue (capped to avoid unbounded
// growth if nobody is around to drain it).
export function crier(world: World, line: string): void {
  world.crierQueue ??= [];
  world.crierQueue.push(line);
  if (world.crierQueue.length > 20) {
    world.crierQueue.splice(0, world.crierQueue.length - 20);
  }
}

export function terrainAt(world: World, row: number, col: number): string {
  if (row < 0 || row >= world.height || col < 0 || col >= world.width) return '#';
  return world.grid[row][col] ?? '#';
}

export function isWalkable(token: string): boolean {
  return token !== '#' && token !== '^' && token !== '~';
}

export function entityAt(world: World, row: number, col: number): Character | Mob | null {
  for (const c of Object.values(world.chars)) {
    if (c.hp > 0 && !c.away && c.pos && c.pos[0] === row && c.pos[1] === col) return c;
  }
  for (const m of Object.values(world.mobs)) {
    if (m.pos[0] === row && m.pos[1] === col) return m;
  }
  return null;
}

export function lootAt(world: World, row: number, col: number): Loot | null {
  for (const l of Object.values(world.loot)) {
    if (l.pos[0] === row && l.pos[1] === col) return l;
  }
  return null;
}

export function cheby(a: [number, number], b: [number, number]): number {
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));
}

export function nextId(world: World, prefix: string): string {
  return `${prefix}-${world.nextId++}`;
}

export function findOpenCell(world: World, near: [number, number], maxRadius = 6): [number, number] | null {
  for (let radius = 0; radius <= maxRadius; radius++) {
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== radius && radius !== 0) continue;
        const r = near[0] + dr;
        const c = near[1] + dc;
        if (!isWalkable(terrainAt(world, r, c))) continue;
        if (entityAt(world, r, c)) continue;
        return [r, c];
      }
    }
  }
  return null;
}

export function levelFor(xp: number): number {
  // 50 xp for L2, then +50 per level. L1 = 0xp, L2 = 50, L3 = 100, L4 = 150...
  return 1 + Math.floor(xp / 50);
}

export function xpToNext(xp: number): number {
  const lvl = levelFor(xp);
  return lvl * 50 - xp;
}

export interface EffectiveStats {
  atk: number;
  def: number;
  maxHp: number;
  bonusAtk: number;
  bonusDef: number;
}

export function effectiveStats(char: Character): EffectiveStats {
  const weapon = char.equipment?.weapon ? ITEMS[char.equipment.weapon] : undefined;
  const armor = char.equipment?.armor ? ITEMS[char.equipment.armor] : undefined;
  const bonusAtk = weapon?.atk ?? 0;
  const bonusDef = armor?.def ?? 0;
  return {
    atk: char.atk + bonusAtk,
    def: char.def + bonusDef,
    maxHp: char.maxHp,
    bonusAtk,
    bonusDef,
  };
}

// Kept for backwards compatibility with older imports.
export function statsFor(char: Character): { atk: number; def: number; maxHp: number } {
  const e = effectiveStats(char);
  return { atk: e.atk, def: e.def, maxHp: e.maxHp };
}
