import { randomUUID } from 'node:crypto';
import { logger } from '@bots/shared';
import { sendText, markRead } from './client.ts';
import { env } from './env.ts';
import { parseWhen } from './reminders/parse.ts';
import { addReminder, listReminders, cancelReminder } from './reminders/store.ts';

const log = logger.scoped('whatsapp');

interface WhatsAppMessage {
  from: string;
  id: string;
  type: string;
  text?: { body: string };
}

export async function handleMessage(msg: WhatsAppMessage): Promise<void> {
  if (env.WHATSAPP_ALLOWED_NUMBER && msg.from !== env.WHATSAPP_ALLOWED_NUMBER) {
    log.warn(`Ignoring message from unauthorized number ${msg.from}`);
    return;
  }

  await markRead(msg.id).catch((err) => log.warn('markRead failed', err));

  if (msg.type !== 'text' || !msg.text) {
    await sendText(msg.from, "I can only handle text messages right now.");
    return;
  }

  const text = msg.text.body.trim();
  log.info(`<- ${msg.from}: ${text}`);

  const reply = await route(msg.from, text);
  await sendText(msg.from, reply);
  log.info(`-> ${msg.from}: ${reply}`);
}

async function route(from: string, text: string): Promise<string> {
  const lower = text.toLowerCase();
  if (lower === 'ping') return 'pong';
  if (lower === 'help') {
    return [
      'Personal assistant commands:',
      '  ping  - health check',
      '  help  - this message',
      '  remind <when> <text>  - schedule a reminder (e.g. `30m`, `2h`, `tomorrow 9am`)',
      '  reminders            - list pending reminders',
      '  cancel <id>          - cancel a reminder',
    ].join('\n');
  }

  if (lower === 'reminders' || lower === 'remind list') {
    const rems = await listReminders(from);
    if (rems.length === 0) return 'No pending reminders.';
    return rems
      .map((r) => `${r.id} — ${r.dueAt} — ${r.text}`)
      .join('\n');
  }

  const cancelMatch = text.match(/^cancel\s+(\S+)$/i);
  if (cancelMatch) {
    const ok = await cancelReminder(cancelMatch[1], from);
    return ok ? `Reminder ${cancelMatch[1]} cancelled.` : `No reminder with ID ${cancelMatch[1]} found.`;
  }

  const remindMatch = text.match(/^remind(?:\s+me)?\s+(.+)$/i);
  if (remindMatch) {
    return await handleRemind(from, remindMatch[1]);
  }

  return `Echo: ${text}`;
}

async function handleRemind(from: string, args: string): Promise<string> {
  const tokens = args.trim().split(/\s+/);
  if (tokens.length < 2) {
    return 'Usage: remind <when> <text> — e.g. `remind 30m grab coffee`';
  }

  let whenRaw: string;
  let body: string;
  const twoToken = tokens.slice(0, 2).join(' ');
  if (parseWhen(twoToken)) {
    whenRaw = twoToken;
    body = tokens.slice(2).join(' ');
  } else {
    whenRaw = tokens[0];
    body = tokens.slice(1).join(' ');
  }

  if (!body) return 'Reminder text is empty.';

  const dueAt = parseWhen(whenRaw);
  if (!dueAt) {
    return 'Could not parse that time. Try `30m`, `2h`, `3d`, `tomorrow 9am`, or `2026-06-01 15:00`.';
  }
  if (dueAt <= new Date()) return 'That time is in the past.';

  const id = randomUUID().slice(0, 8);
  await addReminder({
    id,
    from,
    dueAt: dueAt.toISOString(),
    text: body,
    createdAt: new Date().toISOString(),
  });
  return `Reminder set (id ${id}) — I'll ping you at ${dueAt.toISOString()}.`;
}
