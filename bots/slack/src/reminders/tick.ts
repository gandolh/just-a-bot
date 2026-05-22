import type { WebClient } from '@slack/web-api';
import { logger } from '@bots/shared';
import { getDueReminders, removeReminders } from './store.ts';

const log = logger.scoped('slack:reminders');

export async function tickReminders(client: WebClient): Promise<void> {
  const due = await getDueReminders(new Date());
  if (due.length === 0) return;

  const fired: string[] = [];
  for (const r of due) {
    try {
      await client.chat.postMessage({
        channel: r.channelId,
        text: `<@${r.userId}> reminder: ${r.text}`,
      });
    } catch (err) {
      log.error(`Failed to send reminder ${r.id}`, err);
    }
    fired.push(r.id);
  }
  await removeReminders(fired);
}
