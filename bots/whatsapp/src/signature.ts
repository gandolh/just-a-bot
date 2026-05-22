import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from './env.ts';

export function verifySignature(rawBody: string, header: string | undefined): boolean {
  if (!header || !header.startsWith('sha256=')) return false;
  const expected = createHmac('sha256', env.WHATSAPP_APP_SECRET)
    .update(rawBody)
    .digest('hex');
  const received = header.slice('sha256='.length);
  if (expected.length !== received.length) return false;
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(received, 'hex'));
}
