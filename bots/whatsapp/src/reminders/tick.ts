import { logger } from '@bots/shared';
import { sendText } from '../client.ts';
import { getDueReminders, removeReminders } from './store.ts';

const log = logger.scoped('whatsapp:reminders');

export async function tickReminders(): Promise<void> {
  const due = await getDueReminders(new Date());
  if (due.length === 0) return;

  const fired: string[] = [];
  for (const r of due) {
    try {
      await sendText(r.from, `⏰ Reminder: ${r.text}`);
    } catch (err) {
      log.error(`Failed to send reminder ${r.id}`, err);
    }
    fired.push(r.id);
  }
  await removeReminders(fired);
}
