import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const dataFile = resolve(here, '../../data/timezones.json');

type TimezoneState = Record<string, string>;

// Serialize read-modify-write cycles so concurrent set/unset calls don't clobber
// each other. State is always read fresh from disk rather than cached in memory —
// the bot runs under `tsx watch`, which restarts the process on file changes, so a
// long-lived in-memory cache would silently drift from the file.
let writeChain: Promise<void> = Promise.resolve();

async function read(): Promise<TimezoneState> {
  try {
    const raw = await readFile(dataFile, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as TimezoneState) : {};
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    return {};
  }
}

/** Atomically read the current state, apply a mutation, and persist it. */
async function update(mutate: (state: TimezoneState) => void): Promise<void> {
  const run = writeChain.then(async () => {
    const state = await read();
    mutate(state);
    await mkdir(dirname(dataFile), { recursive: true });
    await writeFile(dataFile, JSON.stringify(state, null, 2), 'utf8');
  });
  // Keep the chain alive even if this write throws, but surface the error here.
  writeChain = run.catch(() => {});
  await run;
}

export async function getTimezone(userId: string): Promise<string | undefined> {
  const s = await read();
  return s[userId];
}

export async function setTimezone(userId: string, tz: string): Promise<void> {
  await update((s) => {
    s[userId] = tz;
  });
}

export async function removeTimezone(userId: string): Promise<void> {
  await update((s) => {
    delete s[userId];
  });
}

export async function getAllTimezones(): Promise<Record<string, string>> {
  return read();
}
