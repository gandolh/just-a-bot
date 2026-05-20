import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const dataDir = resolve(here, '../../data/worlds');

export type Ability = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';

// Overworld terrain tokens. Stored as ASCII for compact storage and easy
// pathing checks; the renderer maps each to an emoji.
//   . open ground   # wall/building   ~ water   f forest
//   ^ mountain      = road            > stairs down   < stairs up   + door
export type Terrain = '.' | '#' | '~' | 'f' | '^' | '=' | '>' | '<' | '+';

export interface AbilityScores {
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
}

export interface CharacterSheet {
  name: string;
  class: string;
  level: number;
  race: string;
  glyph?: string;
  abilities: AbilityScores;
  proficiencyBonus: number;
  proficiencies: {
    savingThrows: Ability[];
    skills: string[];
  };
  hp: { current: number; max: number; temp: number };
  ac: number;
  speed: number;
  conditions: string[];
  equipped: {
    mainHand?: string;
    offHand?: string;
    armor?: string;
  };
  inventory: { item: string; qty: number }[];
  spellSlots: Record<string, { current: number; max: number }>;
  knownSpells: string[];
  notes: string;
}

export interface Overworld {
  width: number;
  height: number;
  grid: string[];
}

// A zone is now a *labeled region* of the overworld — not its own grid.
// Used for naming, descriptions, and "where am I" lookups.
export interface Zone {
  name: string;
  description: string;
  bounds: { row: number; col: number; width: number; height: number };
}

export interface MonsterStatBlock {
  size: string;
  type: string;
  alignment: string;
  speed: Record<string, string>;
  abilities: AbilityScores;
  challengeRating: number;
  xp: number;
  specialAbilities: { name: string; desc: string }[];
  actions: { name: string; desc: string }[];
}

// All entity positions are overworld coordinates [row, col].
export interface PcEntity {
  kind: 'pc';
  characterId: string;
  pos: [number, number];
}

export interface MonsterEntity {
  kind: 'monster';
  name: string;
  glyph?: string;
  pos: [number, number];
  hp: { current: number; max: number };
  ac: number;
  conditions: string[];
  statBlock: MonsterStatBlock;
  aiControlled?: boolean;
  srdSlug?: string;
}

export interface NpcEntity {
  kind: 'npc';
  name: string;
  glyph?: string;
  pos: [number, number];
  dialogue: string;
}

export interface ShopItem {
  item: string;
  price: number;
  qty?: number;
}

export interface ShopEntity {
  kind: 'shop';
  name: string;
  glyph?: string;
  pos: [number, number];
  greeting: string;
  inventory: ShopItem[];
  // Optional per-item buy-back prices keyed by item name. If absent, the
  // shop pays half the listed sale price.
  buyBack?: Record<string, number>;
}

export type Entity = PcEntity | MonsterEntity | NpcEntity | ShopEntity;

export interface Encounter {
  label: string;
  round: number;
  turnIndex: number;
  order: { entityId: string; initiative: number }[];
  movementBudget: Record<string, number>;
  log: { round: number; actor: string; action: string; rolls: unknown[] }[];
}

export interface World {
  guildId: string;
  name: string;
  dmUserId: string;
  updatedAt: string;
  overworld: Overworld;
  characters: Record<string, CharacterSheet>;
  zones: Record<string, Zone>;
  entities: Record<string, Entity>;
  encounter: Encounter | null;
  story: {
    currentScene: string;
    flags: Record<string, unknown>;
    questLog: { id: string; title: string; done: boolean }[];
  };
}

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
  const snapshot = JSON.stringify(world, null, 2);
  const prev = writeChains.get(guildId) ?? Promise.resolve();
  const next = prev.then(async () => {
    await mkdir(dataDir, { recursive: true });
    await writeFile(pathFor(guildId), snapshot, 'utf8');
  });
  writeChains.set(guildId, next);
  await next;
}

export function emptyOverworld(width: number, height: number): Overworld {
  return {
    width,
    height,
    grid: Array.from({ length: height }, () => '.'.repeat(width)),
  };
}

export async function createWorld(
  guildId: string,
  dmUserId: string,
  name: string,
  width = 100,
  height = 100,
): Promise<World> {
  const existing = await loadWorld(guildId);
  if (existing) throw new Error(`World already exists for guild ${guildId}`);
  const world: World = {
    guildId,
    name,
    dmUserId,
    updatedAt: new Date().toISOString(),
    overworld: emptyOverworld(width, height),
    characters: {},
    zones: {},
    entities: {},
    encounter: null,
    story: { currentScene: '', flags: {}, questLog: [] },
  };
  await persist(guildId, world);
  return world;
}

export async function updateWorld(
  guildId: string,
  mutate: (world: World) => void | Promise<void>,
): Promise<World> {
  const world = await loadWorld(guildId);
  if (!world) throw new Error(`No world for guild ${guildId}`);
  await mutate(world);
  await persist(guildId, world);
  return world;
}

export function isDm(world: World, userId: string): boolean {
  return world.dmUserId === userId;
}

export function modifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function terrainAt(world: World, row: number, col: number): string {
  const { width, height, grid } = world.overworld;
  if (row < 0 || row >= height || col < 0 || col >= width) return '#';
  return grid[row][col] ?? '#';
}

export function setTerrain(
  world: World,
  row: number,
  col: number,
  token: string,
): void {
  const { width, height, grid } = world.overworld;
  if (row < 0 || row >= height || col < 0 || col >= width) return;
  const line = grid[row];
  grid[row] = line.slice(0, col) + token + line.slice(col + 1);
}

export function isWalkableTerrain(token: string): boolean {
  // Walls and mountains block movement. Water blocks too (no swimming yet).
  return token !== '#' && token !== '^' && token !== '~';
}

export function movementCost(token: string): number {
  // Cells per step. 1 = normal, 2 = difficult terrain.
  if (token === 'f') return 2; // forest
  if (token === '=' || token === '.') return 1;
  return 1;
}

// Returns the zone whose bounds contain (row, col), or null if none.
export function zoneAt(world: World, row: number, col: number): { id: string; zone: Zone } | null {
  for (const [id, z] of Object.entries(world.zones)) {
    const { row: zr, col: zc, width, height } = z.bounds;
    if (row >= zr && row < zr + height && col >= zc && col < zc + width) {
      return { id, zone: z };
    }
  }
  return null;
}
