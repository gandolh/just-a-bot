// WS client: the discord bot connects to dice-activity's /engine endpoint.
// Auto-reconnects with exponential backoff. Pushes state to the backend on
// every engine mutation; receives create/join/roll-now events back.

import { WebSocket } from 'ws';
import { logger } from '@bots/shared';
import type { EngineInbound, EngineOutbound, DiceGameWire } from '@bots/shared';
import {
  cancelByChannel,
  handleCreate,
  handleJoin,
  handleRollNow,
  setStatePusher,
} from './engine.ts';

const log = logger.scoped('dicetable:link');

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
      // known channel if we have one. Channel tracking lives in the game
      // record, so a null state can only follow a finished/cancelled push for
      // a channel the backend already knows about.
      const channelId = lastChannelByGuild.get(guildId);
      if (channelId) {
        lastChannelByGuild.delete(guildId);
        send({ kind: 'no-game', channelId });
      }
      return;
    }
    lastChannelByGuild.set(guildId, game.starterChannelId);
    send({ kind: 'state', channelId: game.starterChannelId, state: game as DiceGameWire });
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

// Track the last channel a guild's table lived on, so a null-state push can
// still address the right channel with a `no-game`.
const lastChannelByGuild = new Map<string, string>();

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
    log.info('connected to dice-activity engine');
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
    case 'create':
      if (!msg.guildId) return;
      registerChannelGuild(msg.channelId, msg.guildId);
      await handleCreate(msg.guildId, msg.channelId, msg.userId, msg.tag, msg.bet);
      break;
    case 'join':
      if (!msg.guildId) return;
      registerChannelGuild(msg.channelId, msg.guildId);
      await handleJoin(msg.guildId, msg.userId, msg.tag);
      break;
    case 'roll-now':
      await tryRollNowByChannel(msg.channelId, msg.userId);
      break;
    case 'instance-ended':
      await tryCancelByChannel(msg.channelId);
      break;
  }
}

// Helper: the bot stores per-guild but the activity layer keys by channel.
// We track channel→guild as tables are created.
const channelToGuild = new Map<string, string>();
export function registerChannelGuild(channelId: string, guildId: string): void {
  channelToGuild.set(channelId, guildId);
}

async function tryRollNowByChannel(channelId: string, userId: string): Promise<void> {
  const guildId = channelToGuild.get(channelId);
  if (!guildId) return;
  await handleRollNow(guildId, userId);
}

async function tryCancelByChannel(channelId: string): Promise<void> {
  const guildId = channelToGuild.get(channelId);
  if (!guildId) return;
  await cancelByChannel(guildId, channelId);
  channelToGuild.delete(channelId);
}
