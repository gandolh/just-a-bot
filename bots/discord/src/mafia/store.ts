import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const dataDir = resolve(here, '../../data/mafia');

export type Role = 'mafia' | 'town' | 'doctor';
export type Phase = 'lobby' | 'day' | 'night' | 'finished';

export interface Player {
  userId: string;
  tag: string;
  role: Role | null;
  alive: boolean;
}

export interface DayVote {
  voterId: string;
  targetId: string;
}

export interface NightAction {
  actorId: string;
  kind: 'kill' | 'save' | 'investigate';
  targetId: string;
}

export interface MafiaGame {
  guildId: string;
  threadId: string;
  starterId: string;
  starterChannelId: string;
  phase: Phase;
  day: number;
  players: Record<string, Player>;
  votes: DayVote[];
  nightActions: NightAction[];
  history: string[];
  lobbyExpiresAt: string | null;
  phaseDeadline: string | null;
  createdAt: string;
}

const cache = new Map<string, MafiaGame | null>();
const writeChains = new Map<string, Promise<void>>();

function pathFor(guildId: string): string {
  return resolve(dataDir, `${guildId}.json`);
}

export async function loadGame(guildId: string): Promise<MafiaGame | null> {
  if (cache.has(guildId)) return cache.get(guildId) ?? null;
  try {
    const raw = await readFile(pathFor(guildId), 'utf8');
    const game = JSON.parse(raw) as MafiaGame | null;
    cache.set(guildId, game);
    return game;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      cache.set(guildId, null);
      return null;
    }
    throw err;
  }
}

async function persist(guildId: string, game: MafiaGame): Promise<void> {
  cache.set(guildId, game);
  const snapshot = JSON.stringify(game);
  const prev = writeChains.get(guildId) ?? Promise.resolve();
  const next = prev.then(async () => {
    await mkdir(dataDir, { recursive: true });
    await writeFile(pathFor(guildId), snapshot, 'utf8');
  });
  writeChains.set(guildId, next);
  await next;
}

async function clearGame(guildId: string): Promise<void> {
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

export async function createGame(
  guildId: string,
  threadId: string,
  starterId: string,
  starterChannelId: string,
): Promise<MafiaGame> {
  const now = new Date().toISOString();
  const game: MafiaGame = {
    guildId,
    threadId,
    starterId,
    starterChannelId,
    phase: 'lobby',
    day: 0,
    players: {},
    votes: [],
    nightActions: [],
    history: [],
    lobbyExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    phaseDeadline: null,
    createdAt: now,
  };
  await persist(guildId, game);
  return game;
}

export async function updateGame(
  guildId: string,
  mutate: (g: MafiaGame) => void | Promise<void>,
): Promise<MafiaGame | null> {
  const game = await loadGame(guildId);
  if (!game) return null;
  await mutate(game);
  await persist(guildId, game);
  return game;
}

export async function deleteGame(guildId: string): Promise<void> {
  await clearGame(guildId);
}
