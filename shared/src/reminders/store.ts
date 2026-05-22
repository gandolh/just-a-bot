import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export type BaseReminder = {
  id: string;
  dueAt: string;
  text: string;
  createdAt: string;
};

export type ReminderStore<R extends BaseReminder> = {
  add(r: R): Promise<void>;
  filter(predicate: (r: R) => boolean): Promise<R[]>;
  remove(predicate: (r: R) => boolean): Promise<boolean>;
  getDue(now: Date): Promise<R[]>;
  removeByIds(ids: string[]): Promise<void>;
};

export function createReminderStore<R extends BaseReminder>(dataFile: string): ReminderStore<R> {
  let state: R[] | null = null;
  let writeChain: Promise<void> = Promise.resolve();

  async function load(): Promise<R[]> {
    if (state) return state;
    try {
      const raw = await readFile(dataFile, 'utf8');
      const parsed: unknown = JSON.parse(raw);
      state = Array.isArray(parsed) ? (parsed as R[]) : [];
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

  return {
    async add(r) {
      const s = await load();
      s.push(r);
      await persist();
    },
    async filter(predicate) {
      const s = await load();
      return s.filter(predicate);
    },
    async remove(predicate) {
      const s = await load();
      const idx = s.findIndex(predicate);
      if (idx < 0) return false;
      s.splice(idx, 1);
      await persist();
      return true;
    },
    async getDue(now) {
      const s = await load();
      return s.filter((r) => new Date(r.dueAt) <= now);
    },
    async removeByIds(ids) {
      const s = await load();
      const set = new Set(ids);
      state = s.filter((r) => !set.has(r.id));
      await persist();
    },
  };
}
