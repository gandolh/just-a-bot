// Per-guild JSON store for /dicetable — one active table per guild, keyed by
// guildId. Mirrors the wallet/mafia store pattern: in-memory cache + a
// per-guild write chain so concurrent mutations serialize. The on-disk shape
// is DiceGameWire (from @bots/shared) so the activity backend and SPA see the
// same structure the bot pushes over WS.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DiceGameWire } from '@bots/shared';

const here = fileURLToPath(new URL('.', import.meta.url));
const dataDir = resolve(here, '../../data/dicetable');

export type DiceGame = DiceGameWire;

const cache = new Map<string, DiceGame | null>();
const writeChains = new Map<string, Promise<void>>();

function pathFor(guildId: string): string {
  return resolve(dataDir, `${guildId}.json`);
}

export async function loadGame(guildId: string): Promise<DiceGame | null> {
  if (cache.has(guildId)) return cache.get(guildId) ?? null;
  try {
    const raw = await readFile(pathFor(guildId), 'utf8');
    const game = JSON.parse(raw) as DiceGame | null;
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

async function persist(guildId: string, game: DiceGame | null): Promise<void> {
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

export async function setGame(guildId: string, game: DiceGame | null): Promise<void> {
  await persist(guildId, game);
}

export async function updateGame(
  guildId: string,
  mutate: (g: DiceGame) => void | Promise<void>,
): Promise<DiceGame | null> {
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
  bet: number;
}): DiceGame {
  const now = new Date().toISOString();
  return {
    guildId: opts.guildId,
    starterId: opts.starterId,
    starterChannelId: opts.channelId,
    phase: 'lobby',
    bet: opts.bet,
    pot: 0,
    players: {},
    winnerIds: [],
    history: [],
    phaseDeadline: null,
    createdAt: now,
  };
}
