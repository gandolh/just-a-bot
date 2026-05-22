import { DiscordSDK } from '@discord/embedded-app-sdk';

const clientId = (import.meta.env.VITE_DISCORD_CLIENT_ID as string | undefined) ?? '';

export const discordSdk = new DiscordSDK(clientId);

export interface AuthResult {
  session: string;
  user: { id: string; username: string; avatar: string | null };
  channelId: string;
  guildId: string | null;
  instanceId: string;
}

export async function authenticate(): Promise<AuthResult> {
  await discordSdk.ready();

  // `rpc.voice.read` is requested but may be rejected if not yet approved by
  // Discord — that's fine, we degrade gracefully (no speaking indicators).
  const { code } = await discordSdk.commands.authorize({
    client_id: clientId,
    response_type: 'code',
    state: '',
    prompt: 'none',
    scope: ['identify', 'guilds.members.read', 'rpc.voice.read'],
  });

  const channelId = discordSdk.channelId;
  if (!channelId) throw new Error('not-in-voice-channel');
  const guildId = discordSdk.guildId ?? null;
  const instanceId = discordSdk.instanceId;

  const res = await fetch('/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, instanceId, channelId, guildId }),
  });
  if (!res.ok) throw new Error(`token-exchange-failed-${res.status}`);
  const body = (await res.json()) as {
    session: string;
    user: { id: string; username: string; avatar: string | null };
  };

  return { ...body, channelId, guildId, instanceId };
}
