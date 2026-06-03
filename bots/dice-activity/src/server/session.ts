import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from './env.ts';

const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

export interface Session {
  userId: string;
  username: string;
  avatar: string | null;
  channelId: string;
  guildId: string | null;
  instanceId: string;
  exp: number;
}

function b64u(buf: Buffer | string): string {
  const b = typeof buf === 'string' ? Buffer.from(buf) : buf;
  return b.toString('base64url');
}

function fromB64u(s: string): Buffer {
  return Buffer.from(s, 'base64url');
}

function sign(payload: string): string {
  return createHmac('sha256', env.SESSION_HMAC_KEY).update(payload).digest('base64url');
}

export function signSession(s: Omit<Session, 'exp'>): { token: string; session: Session } {
  const session: Session = { ...s, exp: Date.now() + SESSION_TTL_MS };
  const payload = b64u(JSON.stringify(session));
  const sig = sign(payload);
  return { token: `${payload}.${sig}`, session };
}

export function verifySession(token: string): Session | null {
  const dot = token.indexOf('.');
  if (dot < 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  const expected = sign(payload);
  const a = fromB64u(sig);
  const b = fromB64u(expected);
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;

  try {
    const parsed = JSON.parse(fromB64u(payload).toString('utf8')) as Session;
    if (typeof parsed.exp !== 'number' || parsed.exp < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}
