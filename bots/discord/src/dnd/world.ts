import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const dataDir = resolve(here, '../../data/worlds');

export type Ability = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
export type GridToken = '.' | '#' | '~' | '+' | '>' | '<';

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

export interface Zone {
  name: string;
  width: number;
  height: number;
  grid: string[];
  description: string;
  exits: Record<string, { to: string; atCell: [number, number] }>;
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

export interface PcEntity {
  kind: 'pc';
  characterId: string;
  zone: string;
  pos: [number, number];
}

export interface MonsterEntity {
  kind: 'monster';
  name: string;
  zone: string;
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
  zone: string;
  pos: [number, number];
  dialogue: string;
}

export type Entity = PcEntity | MonsterEntity | NpcEntity;

export interface Encounter {
  zone: string;
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

export async function createWorld(
  guildId: string,
  dmUserId: string,
  name: string,
): Promise<World> {
  const existing = await loadWorld(guildId);
  if (existing) throw new Error(`World already exists for guild ${guildId}`);
  const world: World = {
    guildId,
    name,
    dmUserId,
    updatedAt: new Date().toISOString(),
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
