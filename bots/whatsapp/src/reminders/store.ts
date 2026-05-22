import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createReminderStore, type BaseReminder } from '@bots/shared';

const here = fileURLToPath(new URL('.', import.meta.url));
const dataFile = resolve(here, '../../data/reminders.json');

export type Reminder = BaseReminder & {
  from: string;
};

const store = createReminderStore<Reminder>(dataFile);

export async function addReminder(r: Reminder): Promise<void> {
  await store.add(r);
}

export async function listReminders(from: string): Promise<Reminder[]> {
  return store.filter((r) => r.from === from);
}

export async function cancelReminder(id: string, from: string): Promise<boolean> {
  return store.remove((r) => r.id === id && r.from === from);
}

export async function getDueReminders(now: Date): Promise<Reminder[]> {
  return store.getDue(now);
}

export async function removeReminders(ids: string[]): Promise<void> {
  await store.removeByIds(ids);
}
