import type { Client } from 'discord.js';
import { logger } from '@bots/shared';
import { getDueReminders, removeReminders } from './store.ts';
import { getAllBirthdays, updateLastFiredYear } from './birthdays.ts';

const log = logger.scoped('reminders');

export async function tickReminders(client: Client): Promise<void> {
  const now = new Date();
  const due = await getDueReminders(now);
  if (due.length === 0) return;

  const fired: string[] = [];
  for (const r of due) {
    try {
      const ch = await client.channels.fetch(r.channelId);
      if (ch && ch.isTextBased() && 'send' in ch) {
        await (ch as { send(msg: string): Promise<unknown> }).send(reminderMessage(r.userId, r.text));
      }
      fired.push(r.id);
    } catch (err) {
      log.error(`Failed to send reminder ${r.id}`, err);
      fired.push(r.id);
    }
  }
  await removeReminders(fired);
}

/**
 * The delivered reminder, kept under Discord's 2000-character limit. Text is
 * capped at 1000 when set, but reminders stored before the cap can be longer.
 * Over the limit the send throws, and the catch below then deletes the reminder
 * undelivered, so it is truncated here instead.
 */
export function reminderMessage(userId: string, text: string): string {
  const prefix = `<@${userId}> reminder: `;
  const room = DISCORD_MESSAGE_MAX - prefix.length;
  return prefix + (text.length > room ? `${text.slice(0, room - 1)}…` : text);
}

const DISCORD_MESSAGE_MAX = 2000;

export async function tickBirthdays(client: Client): Promise<void> {
  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth() + 1;
  const currentDay = now.getUTCDate();

  const all = await getAllBirthdays();
  for (const b of all) {
    if (b.month !== currentMonth || b.day !== currentDay) continue;
    if (b.lastFiredYear === currentYear) continue;
    try {
      const ch = await client.channels.fetch(b.channelId);
      if (ch && ch.isTextBased() && 'send' in ch) {
        await (ch as { send(msg: string): Promise<unknown> }).send(
          `🎂 Happy birthday <@${b.userId}>!`,
        );
      }
      await updateLastFiredYear(b.guildId, b.userId, currentYear);
    } catch (err) {
      log.error(`Failed to send birthday wish for ${b.userId}`, err);
    }
  }
}
