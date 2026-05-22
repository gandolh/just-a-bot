import { logger } from '@bots/shared';
import { sendText, markRead } from './client.ts';
import { env } from './env.ts';

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

  const reply = await route(text);
  await sendText(msg.from, reply);
  log.info(`-> ${msg.from}: ${reply}`);
}

async function route(text: string): Promise<string> {
  const lower = text.toLowerCase();
  if (lower === 'ping') return 'pong';
  if (lower === 'help') {
    return [
      'Personal assistant commands:',
      '  ping  - health check',
      '  help  - this message',
    ].join('\n');
  }
  return `Echo: ${text}`;
}
