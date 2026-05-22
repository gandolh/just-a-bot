import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const dataFile = resolve(here, '../../../data/birthdays.json');

export type Birthday = {
  userId: string;
  guildId: string;
  channelId: string;
  month: number;
  day: number;
  lastFiredYear: number | null;
};

type BirthdaysState = Record<string, Birthday>;

let state: BirthdaysState | null = null;
let writeChain: Promise<void> = Promise.resolve();

function key(guildId: string, userId: string): string {
  return `${guildId}:${userId}`;
}

async function load(): Promise<BirthdaysState> {
  if (state) return state;
  try {
    const raw = await readFile(dataFile, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    state = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as BirthdaysState)
      : {};
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

export async function setBirthday(b: Birthday): Promise<void> {
  const s = await load();
  s[key(b.guildId, b.userId)] = b;
  await persist();
}

export async function removeBirthday(guildId: string, userId: string): Promise<boolean> {
  const s = await load();
  const k = key(guildId, userId);
  if (!s[k]) return false;
  delete s[k];
  await persist();
  return true;
}

export async function listBirthdays(guildId: string): Promise<Birthday[]> {
  const s = await load();
  return Object.values(s)
    .filter((b) => b.guildId === guildId)
    .sort((a, b) => a.month - b.month || a.day - b.day);
}

export async function getAllBirthdays(): Promise<Birthday[]> {
  const s = await load();
  return Object.values(s);
}

export async function updateLastFiredYear(guildId: string, userId: string, year: number): Promise<void> {
  const s = await load();
  const k = key(guildId, userId);
  if (s[k]) {
    s[k].lastFiredYear = year;
    await persist();
  }
}
