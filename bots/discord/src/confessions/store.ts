import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const dataDir = resolve(here, '../../data/confessions');

export interface ConfessionEntry {
  id: number;
  text: string;
  postedAt: string;
}

export interface ConfessionStore {
  channelId: string | null;
  nextId: number;
  confessions: ConfessionEntry[];
}

const cache = new Map<string, ConfessionStore>();
const writeChains = new Map<string, Promise<void>>();

function pathFor(guildId: string): string {
  return resolve(dataDir, `${guildId}.json`);
}

export async function loadStore(guildId: string): Promise<ConfessionStore> {
  if (cache.has(guildId)) return cache.get(guildId)!;
  try {
    const raw = await readFile(pathFor(guildId), 'utf8');
    const store = JSON.parse(raw) as ConfessionStore;
    cache.set(guildId, store);
    return store;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      const store: ConfessionStore = { channelId: null, nextId: 1, confessions: [] };
      cache.set(guildId, store);
      return store;
    }
    throw err;
  }
}

async function persist(guildId: string, store: ConfessionStore): Promise<void> {
  cache.set(guildId, store);
  const snapshot = JSON.stringify(store, null, 2);
  const prev = writeChains.get(guildId) ?? Promise.resolve();
  const next = prev.then(async () => {
    await mkdir(dataDir, { recursive: true });
    await writeFile(pathFor(guildId), snapshot, 'utf8');
  });
  writeChains.set(guildId, next);
  await next;
}

export async function setChannel(guildId: string, channelId: string): Promise<void> {
  const store = await loadStore(guildId);
  store.channelId = channelId;
  await persist(guildId, store);
}

export async function addConfession(
  guildId: string,
  text: string,
): Promise<ConfessionEntry> {
  const store = await loadStore(guildId);
  const entry: ConfessionEntry = {
    id: store.nextId,
    text,
    postedAt: new Date().toISOString(),
  };
  store.confessions.push(entry);
  store.nextId += 1;
  await persist(guildId, store);
  return entry;
}
