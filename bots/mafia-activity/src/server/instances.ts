// Instance lifecycle (milestone 4).
//
// Discord identifies an Activity launch by `instanceId` — a fresh value every
// time the iframe is opened. Our game state is keyed by `channelId` (one game
// per voice channel). When all sockets for a given instance close, we wait
// 30s (network hiccup grace) and then emit `instance-ended` to the bot, which
// cancels the game.
//
// New-instance-for-same-channel-with-active-game = "end old, start new"
// (locked-in design decision). When the bot pushes a `state` for a channel
// whose tracked instanceId differs, we treat the old instance as orphaned.

import { logger } from '@bots/shared';
import type { PlaySocket } from './ws.ts';
import { sendToPlay } from './ws.ts';
import type { SpaInbound, MafiaGameWire, RedactedGame, Role } from '@bots/shared';

const log = logger.scoped('mafia-activity:instances');

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
const latestState = new Map<string, MafiaGameWire>(); // channelId → last state

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

  // Replay the latest state for this channel, redacted to this socket.
  const state = latestState.get(inst.channelId);
  if (state) {
    sendToPlay(sock.ws, { kind: 'state', state: redactFor(state, sock.session.userId) });
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
      log.info(`instance ${inst.instanceId}: 30s empty → ending game on channel ${inst.channelId}`);
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

export function broadcastState(channelId: string, state: MafiaGameWire): void {
  latestState.set(channelId, state);
  const instanceId = byChannel.get(channelId);
  if (!instanceId) return;
  const inst = byInstance.get(instanceId);
  if (!inst) return;
  for (const sock of inst.sockets) {
    const msg: SpaInbound = { kind: 'state', state: redactFor(state, sock.session.userId) };
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

export function getLatestState(channelId: string): MafiaGameWire | null {
  return latestState.get(channelId) ?? null;
}

// ============================================================================
// Redaction (milestone 5 — viewer-scoped state)
// ============================================================================

function redactFor(state: MafiaGameWire, userId: string): RedactedGame {
  const viewer = state.players[userId];
  const viewerRole = viewer?.role ?? null;
  const viewerAlive = viewer?.alive ?? false;
  const isMafia = viewerRole === 'mafia';
  const isDoctor = viewerRole === 'doctor';

  // Reveal-rules: game finished OR the viewer is dead → show all roles
  //               (mafia know each other) → mafia see other mafia
  //               (otherwise) → only the viewer's own role is visible.
  const finished = state.phase === 'finished';
  const players: Record<string, MafiaGameWire['players'][string]> = {};
  for (const [id, p] of Object.entries(state.players)) {
    let role: Role | null;
    if (finished || !viewerAlive) role = p.role;
    else if (id === userId) role = p.role;
    else if (isMafia && p.role === 'mafia') role = 'mafia';
    else role = null;
    players[id] = { ...p, role };
  }

  const redacted: RedactedGame = {
    phase: state.phase,
    day: state.day,
    players,
    votes: state.votes,
    history: state.history,
    phaseDeadline: state.phaseDeadline,
    you: {
      userId,
      role: viewerRole,
      alive: viewerAlive,
    },
  };

  if (isMafia) {
    redacted.coMafia = Object.values(state.players)
      .filter((p) => p.role === 'mafia' && p.userId !== userId)
      .map((p) => p.userId);
  }
  if (state.phase === 'night' && (isMafia || isDoctor)) {
    redacted.nightTargets = Object.values(state.players)
      .filter((p) => p.alive && (isMafia ? p.role !== 'mafia' : true))
      .map((p) => p.userId);
  }

  return redacted;
}
