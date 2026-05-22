// Parallel JSON store for /mafia2 — keyed per-guild like /mafia but in a
// separate directory so the two implementations never collide. Wire types
// are imported from @bots/shared so the activity backend and SPA see the
// same shape.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { MafiaGameWire } from '@bots/shared';

const here = fileURLToPath(new URL('.', import.meta.url));
const dataDir = resolve(here, '../../data/mafia2');

export type MafiaGame = MafiaGameWire;

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

async function persist(guildId: string, game: MafiaGame | null): Promise<void> {
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

export async function setGame(guildId: string, game: MafiaGame | null): Promise<void> {
  await persist(guildId, game);
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

export function createGame(opts: {
  guildId: string;
  channelId: string;
  starterId: string;
}): MafiaGame {
  const now = new Date().toISOString();
  return {
    guildId: opts.guildId,
    threadId: '', // unused for /mafia2 — placeholder for wire compatibility
    starterId: opts.starterId,
    starterChannelId: opts.channelId,
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
}
