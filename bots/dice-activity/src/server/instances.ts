// Instance lifecycle.
//
// Discord identifies an Activity launch by `instanceId` — a fresh value every
// time the iframe is opened. Our game state is keyed by `channelId` (one table
// per voice channel). When all sockets for a given instance close, we wait
// 30s (network hiccup grace) and then emit `instance-ended` to the bot, which
// cancels the table.
//
// New-instance-for-same-channel-with-active-game = "end old, start new".
//
// Dice has no hidden information: every socket on a channel gets the exact
// same DiceGameWire. There is no redaction (the old Mafia activity needed it
// for roles; dice doesn't).

import { logger } from '@bots/shared';
import type { PlaySocket } from './ws.ts';
import { sendToPlay } from './ws.ts';
import type { SpaInbound, DiceGameWire } from '@bots/shared';

const log = logger.scoped('dice-activity:instances');

const EMPTY_DEBOUNCE_MS = 30_000;

interface Instance {
  instanceId: string;
  channelId: string;
  guildId: string | null;
  sockets: Set<PlaySocket>;
  emptySince: number | null;
  emptyTimer: NodeJS.Timeout | null;
}

const byInstance = new Map<string, Instance>();
const byChannel = new Map<string, string>(); // channelId → instanceId
const latestState = new Map<string, DiceGameWire>(); // channelId → last state

type EmitInstanceEnded = (channelId: string) => void;
let emitInstanceEnded: EmitInstanceEnded = () => {};
export function setInstanceEndedEmitter(fn: EmitInstanceEnded): void {
  emitInstanceEnded = fn;
}

function getOrCreate(instanceId: string, channelId: string, guildId: string | null): Instance {
  let inst = byInstance.get(instanceId);
  if (inst) return inst;

  // Same channel, different instance → end old.
  const existing = byChannel.get(channelId);
  if (existing && existing !== instanceId) {
    log.info(`channel ${channelId}: replacing instance ${existing} → ${instanceId}`);
    forceEnd(existing);
  }

  inst = {
    instanceId,
    channelId,
    guildId,
    sockets: new Set(),
    emptySince: null,
    emptyTimer: null,
  };
  byInstance.set(instanceId, inst);
  byChannel.set(channelId, instanceId);
  return inst;
}

export function registerPlaySocket(sock: PlaySocket): void {
  const inst = getOrCreate(sock.session.instanceId, sock.session.channelId, sock.session.guildId);
  inst.sockets.add(sock);
  if (inst.emptyTimer) {
    clearTimeout(inst.emptyTimer);
    inst.emptyTimer = null;
    inst.emptySince = null;
    log.info(`instance ${inst.instanceId}: empty timer cancelled`);
  }

  // Replay the latest state for this channel.
  const state = latestState.get(inst.channelId);
  if (state) {
    sendToPlay(sock.ws, { kind: 'state', state });
  } else {
    sendToPlay(sock.ws, { kind: 'no-game' });
  }
}

export function unregisterPlaySocket(sock: PlaySocket): void {
  const inst = byInstance.get(sock.session.instanceId);
  if (!inst) return;
  inst.sockets.delete(sock);
  if (inst.sockets.size === 0) {
    inst.emptySince = Date.now();
    inst.emptyTimer = setTimeout(() => {
      log.info(`instance ${inst.instanceId}: 30s empty → ending table on channel ${inst.channelId}`);
      forceEnd(inst.instanceId);
    }, EMPTY_DEBOUNCE_MS);
  }
}

function forceEnd(instanceId: string): void {
  const inst = byInstance.get(instanceId);
  if (!inst) return;
  if (inst.emptyTimer) clearTimeout(inst.emptyTimer);
  byInstance.delete(instanceId);
  if (byChannel.get(inst.channelId) === instanceId) {
    byChannel.delete(inst.channelId);
    latestState.delete(inst.channelId);
    emitInstanceEnded(inst.channelId);
  }
  // Close any straggler sockets.
  for (const s of inst.sockets) {
    try { s.ws.close(4404, 'instance-ended'); } catch { /* noop */ }
  }
}

// ============================================================================
// State broadcast (from the engine via /engine WS)
// ============================================================================

export function broadcastState(channelId: string, state: DiceGameWire): void {
  latestState.set(channelId, state);
  const instanceId = byChannel.get(channelId);
  if (!instanceId) return;
  const inst = byInstance.get(instanceId);
  if (!inst) return;
  const msg: SpaInbound = { kind: 'state', state };
  for (const sock of inst.sockets) {
    sendToPlay(sock.ws, msg);
  }
}

export function broadcastNoGame(channelId: string): void {
  latestState.delete(channelId);
  const instanceId = byChannel.get(channelId);
  if (!instanceId) return;
  const inst = byInstance.get(instanceId);
  if (!inst) return;
  for (const sock of inst.sockets) {
    sendToPlay(sock.ws, { kind: 'no-game' });
  }
}

export function broadcastEngineOffline(): void {
  for (const inst of byInstance.values()) {
    for (const sock of inst.sockets) {
      sendToPlay(sock.ws, { kind: 'engine-offline' });
    }
  }
}

export function broadcastEngineOnline(): void {
  for (const inst of byInstance.values()) {
    for (const sock of inst.sockets) {
      sendToPlay(sock.ws, { kind: 'engine-online' });
    }
  }
}

export function getInstance(channelId: string): Instance | null {
  const instanceId = byChannel.get(channelId);
  if (!instanceId) return null;
  return byInstance.get(instanceId) ?? null;
}

export function getLatestState(channelId: string): DiceGameWire | null {
  return latestState.get(channelId) ?? null;
}
