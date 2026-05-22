import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const dataFile = resolve(here, '../../data/timezones.json');

type State = Record<string, Record<string, string>>; // teamId -> userId -> tz

let state: State | null = null;
let writeChain: Promise<void> = Promise.resolve();

async function load(): Promise<State> {
  if (state) return state;
  try {
    const raw = await readFile(dataFile, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    state = parsed && typeof parsed === 'object' ? (parsed as State) : {};
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

export async function setTimezone(teamId: string, userId: string, tz: string): Promise<void> {
  const s = await load();
  if (!s[teamId]) s[teamId] = {};
  s[teamId][userId] = tz;
  await persist();
}

export async function removeTimezone(teamId: string, userId: string): Promise<void> {
  const s = await load();
  if (s[teamId]) {
    delete s[teamId][userId];
    if (Object.keys(s[teamId]).length === 0) delete s[teamId];
    await persist();
  }
}

export async function getTeamTimezones(teamId: string): Promise<Record<string, string>> {
  const s = await load();
  return s[teamId] ?? {};
}
