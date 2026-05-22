// WS client: the discord bot connects to mafia-activity's /engine endpoint.
// Auto-reconnects with exponential backoff. Pushes state to the backend on
// every engine mutation; receives lobby/action events back.

import { WebSocket } from 'ws';
import { logger } from '@bots/shared';
import type { EngineInbound, EngineOutbound, MafiaGameWire, PlayerAction } from '@bots/shared';
import {
  applyAction,
  cancelByChannel,
  handleLobbyJoin,
  handleLobbyStart,
  handleLobbyStartNow,
  setStatePusher,
} from './engine.ts';

const log = logger.scoped('mafia2:link');

interface LinkConfig {
  url: string;
  token: string;
}

let ws: WebSocket | null = null;
let reconnectAttempts = 0;
let stopped = false;

export function startLink(cfg: LinkConfig): void {
  stopped = false;

  setStatePusher((guildId, game) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    if (!game) {
      // Without a game we don't know the channel — emit no-game for the last
      // known channel if we have one. (Channel tracking lives in the game
      // record, so a null state can only follow a finished/cancelled push.)
      return;
    }
    send({ kind: 'state', channelId: game.starterChannelId, state: game as MafiaGameWire });
  });

  connect(cfg);
}

export function stopLink(): void {
  stopped = true;
  if (ws) {
    try { ws.close(); } catch { /* noop */ }
    ws = null;
  }
}

function send(msg: EngineOutbound): void {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function connect(cfg: LinkConfig): void {
  if (stopped) return;
  const url = `${cfg.url}?token=${encodeURIComponent(cfg.token)}`;
  const sock = new WebSocket(url);
  ws = sock;

  sock.on('open', () => {
    reconnectAttempts = 0;
    log.info('connected to mafia-activity engine');
    send({ kind: 'engine-hello', version: 1 });
  });

  sock.on('message', (data) => {
    let msg: EngineInbound;
    try { msg = JSON.parse(data.toString()) as EngineInbound; } catch {
      log.warn('malformed engine message');
      return;
    }
    void handleIncoming(msg).catch((err) => log.error('handler failed', err));
  });

  sock.on('close', () => {
    if (ws === sock) ws = null;
    if (stopped) return;
    reconnectAttempts += 1;
    const backoff = Math.min(15_000, 500 * 2 ** Math.min(reconnectAttempts, 5));
    log.warn(`engine link closed; reconnecting in ${backoff}ms`);
    setTimeout(() => connect(cfg), backoff);
  });

  sock.on('error', (err) => log.warn('engine link error', err.message ?? err));
}

async function handleIncoming(msg: EngineInbound): Promise<void> {
  switch (msg.kind) {
    case 'lobby-start':
      if (!msg.guildId) return;
      registerChannelGuild(msg.channelId, msg.guildId);
      await handleLobbyStart(msg.guildId, msg.channelId, msg.hostUserId, msg.hostTag);
      break;
    case 'lobby-join':
      if (!msg.guildId) return;
      registerChannelGuild(msg.channelId, msg.guildId);
      await handleLobbyJoin(msg.guildId, msg.userId, msg.tag);
      break;
    case 'lobby-start-now':
      // Need a guildId — look up via active games. The activity backend doesn't
      // currently send guildId here. We rely on the channel being mapped to a
      // single guild (true today). Resolve by scanning active state cache.
      await tryStartNowByChannel(msg.channelId, msg.userId);
      break;
    case 'action':
      await tryActionByChannel(msg.channelId, msg.userId, msg.action);
      break;
    case 'instance-ended':
      await tryCancelByChannel(msg.channelId);
      break;
  }
}

// Helper: the bot stores per-guild but the activity layer keys by channel.
// We track channel→guild as games are created.
const channelToGuild = new Map<string, string>();
export function registerChannelGuild(channelId: string, guildId: string): void {
  channelToGuild.set(channelId, guildId);
}

async function tryStartNowByChannel(channelId: string, userId: string): Promise<void> {
  const guildId = channelToGuild.get(channelId);
  if (!guildId) return;
  await handleLobbyStartNow(guildId, userId);
}

async function tryActionByChannel(
  channelId: string,
  userId: string,
  action: PlayerAction,
): Promise<void> {
  const guildId = channelToGuild.get(channelId);
  if (!guildId) return;
  await applyAction(guildId, userId, action);
}

async function tryCancelByChannel(channelId: string): Promise<void> {
  const guildId = channelToGuild.get(channelId);
  if (!guildId) return;
  await cancelByChannel(guildId, channelId);
  channelToGuild.delete(channelId);
}
