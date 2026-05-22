import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const dataFile = resolve(here, '../../data/timezones.json');

type TimezoneState = Record<string, string>;

let state: TimezoneState | null = null;
let writeChain: Promise<void> = Promise.resolve();

async function load(): Promise<TimezoneState> {
  if (state) return state;
  try {
    const raw = await readFile(dataFile, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    state = parsed && typeof parsed === 'object' ? (parsed as TimezoneState) : {};
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    state = {};
  }
  return state;
}

async function persist(): Promise<void> {
  const snapshot = JSON.stringify(state ?? {}, null, 2);
  writeChain = writeChain.then(async () => {
    await mkdir(dirname(dataFile), { recursive: true });
    await writeFile(dataFile, snapshot, 'utf8');
  });
  await writeChain;
}

export async function getTimezone(userId: string): Promise<string | undefined> {
  const s = await load();
  return s[userId];
}

export async function setTimezone(userId: string, tz: string): Promise<void> {
  const s = await load();
  s[userId] = tz;
  await persist();
}

export async function removeTimezone(userId: string): Promise<void> {
  const s = await load();
  delete s[userId];
  await persist();
}

export async function getAllTimezones(): Promise<Record<string, string>> {
  return load();
}
