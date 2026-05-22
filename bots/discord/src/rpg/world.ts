import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const dataDir = resolve(here, '../../data/rpg');

export type Terrain = '.' | '#' | '~' | 'f' | '^' | '=';

export interface Character {
  userId: string;
  name: string;
  glyph: string;
  pos: [number, number];
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
  lastAttackAt: number;
  lastMoveAt: number;
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
  speedMs: number;
  aggroRange: number;
}

export interface Mob {
  id: string;
  kind: string;
  pos: [number, number];
  hp: number;
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
  lastSpawnAt: number;
  updatedAt: string;
}

export const MOB_KINDS: Record<string, MobKind> = {
  slime: {
    slug: 'slime',
    name: 'Slime',
    glyph: '🟢',
    hp: 8, atk: 2, def: 0, xp: 5,
    coins: [0, 2],
    loot: [{ item: 'slime-jelly', chance: 0.3 }],
    speedMs: 4500,
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
    speedMs: 3500,
    aggroRange: 5,
  },
  wolf: {
    slug: 'wolf',
    name: 'Wolf',
    glyph: '🐺',
    hp: 18, atk: 5, def: 1, xp: 18,
    coins: [0, 3],
    loot: [{ item: 'wolf-pelt', chance: 0.4 }],
    speedMs: 2500,
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
    speedMs: 3500,
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
    speedMs: 4000,
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
    speedMs: 5000,
    aggroRange: 4,
  },
};

const cache = new Map<string, World>();
const writeChains = new Map<string, Promise<void>>();

function pathFor(guildId: string): string {
  return resolve(dataDir, `${guildId}.json`);
}

export async function loadWorld(guildId: string): Promise<World | null> {
  if (cache.has(guildId)) return cache.get(guildId)!;
  try {
    const raw = await readFile(pathFor(guildId), 'utf8');
    const world = JSON.parse(raw) as World;
    // Backward-compat defaults for fields added after initial release.
    world.duels ??= {};
    world.trades ??= {};
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
  const snapshot = JSON.stringify(world);
  const prev = writeChains.get(guildId) ?? Promise.resolve();
  const next = prev.then(async () => {
    await mkdir(dataDir, { recursive: true });
    await writeFile(pathFor(guildId), snapshot, 'utf8');
  });
  writeChains.set(guildId, next);
  await next;
}

export async function updateWorld(
  guildId: string,
  mutate: (world: World) => void | Promise<void>,
): Promise<World> {
  let world = await loadWorld(guildId);
  if (!world) world = await getOrCreateWorld(guildId);
  await mutate(world);
  await persist(guildId, world);
  return world;
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
    updatedAt: new Date().toISOString(),
  };
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
    if (c.hp > 0 && c.pos[0] === row && c.pos[1] === col) return c;
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

export function statsFor(char: Character): { atk: number; def: number; maxHp: number } {
  return { atk: char.atk, def: char.def, maxHp: char.maxHp };
}
