import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import { logger } from '@bots/shared';
import { env } from './env.ts';
import { signSession } from './session.ts';

const log = logger.scoped('mafia-activity:auth');

const tokenRequestSchema = z.object({
  code: z.string().min(1),
  instanceId: z.string().min(1),
  channelId: z.string().regex(/^\d+$/),
  guildId: z.string().regex(/^\d+$/).nullable().optional(),
});

const oauthTokenSchema = z.object({
  access_token: z.string(),
  token_type: z.string(),
  expires_in: z.number(),
  scope: z.string(),
});

const meSchema = z.object({
  id: z.string(),
  username: z.string(),
  avatar: z.string().nullable(),
});

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

export async function handleTokenExchange(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  let body: z.infer<typeof tokenRequestSchema>;
  try {
    body = tokenRequestSchema.parse(await readJson(req));
  } catch (err) {
    send(res, 400, { error: 'bad-request', detail: err instanceof Error ? err.message : 'invalid' });
    return;
  }

  const params = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID,
    client_secret: env.DISCORD_CLIENT_SECRET,
    grant_type: 'authorization_code',
    code: body.code,
  });

  const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  });

  if (!tokenRes.ok) {
    const detail = await tokenRes.text();
    log.warn(`oauth exchange failed: ${tokenRes.status} ${detail.slice(0, 200)}`);
    send(res, 401, { error: 'oauth-failed' });
    return;
  }

  let token: z.infer<typeof oauthTokenSchema>;
  try {
    token = oauthTokenSchema.parse(await tokenRes.json());
  } catch {
    send(res, 502, { error: 'oauth-malformed' });
    return;
  }

  const meRes = await fetch('https://discord.com/api/users/@me', {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  if (!meRes.ok) {
    send(res, 502, { error: 'discord-me-failed' });
    return;
  }
  let me: z.infer<typeof meSchema>;
  try {
    me = meSchema.parse(await meRes.json());
  } catch {
    send(res, 502, { error: 'discord-me-malformed' });
    return;
  }

  const { token: sessionToken, session } = signSession({
    userId: me.id,
    username: me.username,
    avatar: me.avatar,
    channelId: body.channelId,
    guildId: body.guildId ?? null,
    instanceId: body.instanceId,
  });

  log.info(`auth ok: ${me.username} (${me.id}) for channel ${body.channelId}`);
  send(res, 200, {
    session: sessionToken,
    user: { id: me.id, username: me.username, avatar: me.avatar },
    exp: session.exp,
  });
}
