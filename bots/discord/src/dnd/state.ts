import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const dataDir = resolve(here, '../../data/dnd');

export type Ability = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
export const ABILITIES: Ability[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

export interface Character {
  userId: string;
  name: string;
  race: string;
  klass: string;
  level: number;
  hp: number;
  maxHp: number;
  ac: number;
  abilities: Record<Ability, number>;
  inventory: string[];
  xp: number;
  notes: string;
}

export interface Monster {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  ac: number;
  initBonus: number;
}

export interface InitEntry {
  refId: string;
  name: string;
  init: number;
  type: 'player' | 'monster';
}

export interface InitiativeState {
  order: InitEntry[];
  turnIdx: number;
  round: number;
}

export interface Scene {
  title: string;
  description: string;
  setAt: string;
}

export interface Campaign {
  guildId: string;
  channelId: string;
  dmId: string;
  startedAt: string;
  updatedAt: string;
  players: Record<string, Character>;
  monsters: Record<string, Monster>;
  nextMonsterNum: number;
  initiative: InitiativeState | null;
  scene: Scene | null;
}

const cache = new Map<string, Campaign | null>();
const writeChains = new Map<string, Promise<void>>();

function pathFor(guildId: string): string {
  return resolve(dataDir, `${guildId}.json`);
}

export async function loadCampaign(guildId: string): Promise<Campaign | null> {
  if (cache.has(guildId)) return cache.get(guildId) ?? null;
  try {
    const raw = await readFile(pathFor(guildId), 'utf8');
    const campaign = JSON.parse(raw) as Campaign;
    cache.set(guildId, campaign);
    return campaign;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      cache.set(guildId, null);
      return null;
    }
    throw err;
  }
}

async function persist(guildId: string, campaign: Campaign): Promise<void> {
  campaign.updatedAt = new Date().toISOString();
  cache.set(guildId, campaign);
  const snapshot = JSON.stringify(campaign);
  const prev = writeChains.get(guildId) ?? Promise.resolve();
  const next = prev.then(async () => {
    await mkdir(dataDir, { recursive: true });
    await writeFile(pathFor(guildId), snapshot, 'utf8');
  });
  writeChains.set(guildId, next);
  await next;
}

async function clear(guildId: string): Promise<void> {
  cache.set(guildId, null);
  const prev = writeChains.get(guildId) ?? Promise.resolve();
  const next = prev.then(async () => {
    try {
      await writeFile(pathFor(guildId), JSON.stringify(null), 'utf8');
    } catch {
      // ignore
    }
  });
  writeChains.set(guildId, next);
  await next;
}

export async function startCampaign(
  guildId: string,
  channelId: string,
  dmId: string,
): Promise<Campaign> {
  const now = new Date().toISOString();
  const campaign: Campaign = {
    guildId,
    channelId,
    dmId,
    startedAt: now,
    updatedAt: now,
    players: {},
    monsters: {},
    nextMonsterNum: 1,
    initiative: null,
    scene: null,
  };
  await persist(guildId, campaign);
  return campaign;
}

export async function endCampaign(guildId: string): Promise<void> {
  await clear(guildId);
}

export async function updateCampaign(
  guildId: string,
  mutate: (c: Campaign) => void | Promise<void>,
): Promise<Campaign | null> {
  const campaign = await loadCampaign(guildId);
  if (!campaign) return null;
  await mutate(campaign);
  await persist(guildId, campaign);
  return campaign;
}

export function abilityMod(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function fmtMod(mod: number): string {
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

export function nextMonsterId(c: Campaign): string {
  return `m${c.nextMonsterNum++}`;
}

export function findMonster(c: Campaign, query: string): Monster | null {
  const q = query.trim().toLowerCase();
  if (c.monsters[q]) return c.monsters[q];
  for (const m of Object.values(c.monsters)) {
    if (m.id.toLowerCase() === q) return m;
    if (m.name.toLowerCase() === q) return m;
  }
  for (const m of Object.values(c.monsters)) {
    if (m.name.toLowerCase().startsWith(q)) return m;
  }
  return null;
}

export function findCharacterByQuery(c: Campaign, query: string): Character | null {
  const q = query.trim().toLowerCase();
  const idMatch = q.match(/^<@!?(\d+)>$/);
  if (idMatch && c.players[idMatch[1]]) return c.players[idMatch[1]];
  if (c.players[q]) return c.players[q];
  for (const p of Object.values(c.players)) {
    if (p.name.toLowerCase() === q) return p;
  }
  for (const p of Object.values(c.players)) {
    if (p.name.toLowerCase().startsWith(q)) return p;
  }
  return null;
}
