import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const dataFile = resolve(here, '../../data/reminders.json');

export type Reminder = {
  id: string;
  userId: string;
  teamId: string;
  channelId: string;
  dueAt: string;
  text: string;
  createdAt: string;
};

type State = Reminder[];

let state: State | null = null;
let writeChain: Promise<void> = Promise.resolve();

async function load(): Promise<State> {
  if (state) return state;
  try {
    const raw = await readFile(dataFile, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    state = Array.isArray(parsed) ? (parsed as State) : [];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    state = [];
  }
  return state;
}

async function persist(): Promise<void> {
  const snapshot = JSON.stringify(state ?? [], null, 2);
  writeChain = writeChain.then(async () => {
    await mkdir(dirname(dataFile), { recursive: true });
    await writeFile(dataFile, snapshot, 'utf8');
  });
  await writeChain;
}

export async function addReminder(r: Reminder): Promise<void> {
  const s = await load();
  s.push(r);
  await persist();
}

export async function listReminders(userId: string, teamId: string): Promise<Reminder[]> {
  const s = await load();
  return s.filter((r) => r.userId === userId && r.teamId === teamId);
}

export async function cancelReminder(id: string, userId: string): Promise<boolean> {
  const s = await load();
  const idx = s.findIndex((r) => r.id === id && r.userId === userId);
  if (idx < 0) return false;
  s.splice(idx, 1);
  await persist();
  return true;
}

export async function getDueReminders(now: Date): Promise<Reminder[]> {
  const s = await load();
  return s.filter((r) => new Date(r.dueAt) <= now);
}

export async function removeReminders(ids: string[]): Promise<void> {
  const s = await load();
  const set = new Set(ids);
  state = s.filter((r) => !set.has(r.id));
  await persist();
}
