import { env } from './env.ts';

const graphUrl = (path: string) =>
  `https://graph.facebook.com/${env.GRAPH_API_VERSION}/${path}`;

export async function sendText(to: string, body: string): Promise<void> {
  const res = await fetch(graphUrl(`${env.WHATSAPP_PHONE_NUMBER_ID}/messages`), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body },
    }),
  });

  if (!res.ok) {
    throw new Error(`WhatsApp send failed: ${res.status} ${await res.text()}`);
  }
}

export async function markRead(messageId: string): Promise<void> {
  await fetch(graphUrl(`${env.WHATSAPP_PHONE_NUMBER_ID}/messages`), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
    }),
  });
}
