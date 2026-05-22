// /mafia2 engine — phase transitions + action application. Shares pure
// helpers (`assignRoles`, `checkWin`, `alivePlayers`, `aliveByRole`) with
// the existing /mafia engine via direct import — see CLAUDE.md note about
// the two implementations sharing code but staying separate.

import { logger } from '@bots/shared';
import type { PlayerAction } from '@bots/shared';
import { assignRoles, alivePlayers, aliveByRole, checkWin } from '../mafia/roles.ts';
import {
  type MafiaGame,
  createGame,
  loadGame,
  setGame,
  updateGame,
} from './store.ts';

const log = logger.scoped('mafia2:engine');

const LOBBY_AUTO_START_MS = 60_000;
const DAY_DEADLINE_MS = 5 * 60_000;
const NIGHT_DEADLINE_MS = 2 * 60_000;
const LOBBY_MIN_PLAYERS = 5;

const dayTimers = new Map<string, ReturnType<typeof setTimeout>>();
const nightTimers = new Map<string, ReturnType<typeof setTimeout>>();
const lobbyTimers = new Map<string, ReturnType<typeof setTimeout>>();

type Pusher = (guildId: string, game: MafiaGame | null) => void;
let pushState: Pusher = () => {};
export function setStatePusher(fn: Pusher): void {
  pushState = fn;
}

function clearTimer(map: Map<string, ReturnType<typeof setTimeout>>, key: string): void {
  const t = map.get(key);
  if (t) {
    clearTimeout(t);
    map.delete(key);
  }
}

function pushIf(guildId: string, game: MafiaGame | null): void {
  pushState(guildId, game);
}

// ============================================================================
// Lobby
// ============================================================================

export async function handleLobbyStart(
  guildId: string,
  channelId: string,
  hostUserId: string,
  hostTag: string,
): Promise<void> {
  const existing = await loadGame(guildId);
  if (existing && existing.phase !== 'finished') {
    // Already a game in progress — ignore. UI shouldn't have offered start.
    return;
  }
  const game = createGame({ guildId, channelId, starterId: hostUserId });
  game.players[hostUserId] = { userId: hostUserId, tag: hostTag, role: null, alive: true };
  await setGame(guildId, game);
  log.info(`lobby created in guild=${guildId} channel=${channelId} by ${hostTag}`);
  scheduleLobbyAutoStart(guildId);
  pushIf(guildId, game);
}

export async function handleLobbyJoin(
  guildId: string,
  userId: string,
  tag: string,
): Promise<void> {
  const game = await updateGame(guildId, (g) => {
    if (g.phase !== 'lobby') return;
    if (g.players[userId]) return;
    g.players[userId] = { userId, tag, role: null, alive: true };
  });
  if (!game) return;
  log.info(`lobby join: ${tag} (now ${Object.keys(game.players).length})`);
  pushIf(guildId, game);
}

export async function handleLobbyStartNow(
  guildId: string,
  _userId: string,
): Promise<void> {
  const game = await loadGame(guildId);
  if (!game || game.phase !== 'lobby') return;
  if (Object.keys(game.players).length < LOBBY_MIN_PLAYERS) return;
  await beginGame(guildId);
}

function scheduleLobbyAutoStart(guildId: string): void {
  clearTimer(lobbyTimers, guildId);
  const t = setTimeout(() => {
    lobbyTimers.delete(guildId);
    void maybeAutoStart(guildId);
  }, LOBBY_AUTO_START_MS);
  lobbyTimers.set(guildId, t);
}

async function maybeAutoStart(guildId: string): Promise<void> {
  const game = await loadGame(guildId);
  if (!game || game.phase !== 'lobby') return;
  if (Object.keys(game.players).length >= LOBBY_MIN_PLAYERS) {
    await beginGame(guildId);
  } else {
    // Not enough players → cancel.
    log.info(`lobby auto-cancel in guild=${guildId} (only ${Object.keys(game.players).length})`);
    await setGame(guildId, null);
    pushIf(guildId, null);
  }
}

async function beginGame(guildId: string): Promise<void> {
  clearTimer(lobbyTimers, guildId);
  const game = await updateGame(guildId, (g) => {
    assignRoles(Object.values(g.players));
    g.lobbyExpiresAt = null;
  });
  if (!game) return;
  log.info(`game begins in guild=${guildId} (${Object.keys(game.players).length} players)`);
  await startDay(guildId);
}

// ============================================================================
// Day
// ============================================================================

async function startDay(guildId: string): Promise<void> {
  const game = await updateGame(guildId, (g) => {
    g.phase = 'day';
    g.day += 1;
    g.votes = [];
    g.phaseDeadline = new Date(Date.now() + DAY_DEADLINE_MS).toISOString();
  });
  if (!game) return;

  clearTimer(dayTimers, guildId);
  const t = setTimeout(() => {
    dayTimers.delete(guildId);
    void resolveDay(guildId, 'timeout');
  }, DAY_DEADLINE_MS);
  dayTimers.set(guildId, t);
  pushIf(guildId, game);
}

async function handleVote(guildId: string, userId: string, targetId: string): Promise<void> {
  const game = await updateGame(guildId, (g) => {
    if (g.phase !== 'day') return;
    const existing = g.votes.find((v) => v.voterId === userId);
    if (existing) {
      if (existing.locked) return;
      existing.targetId = targetId;
    } else {
      g.votes.push({ voterId: userId, targetId, locked: false });
    }
  });
  if (game) pushIf(guildId, game);
}

async function handleRetract(guildId: string, userId: string): Promise<void> {
  const game = await updateGame(guildId, (g) => {
    if (g.phase !== 'day') return;
    const idx = g.votes.findIndex((v) => v.voterId === userId);
    if (idx >= 0 && !g.votes[idx].locked) g.votes.splice(idx, 1);
  });
  if (game) pushIf(guildId, game);
}

async function handleLock(guildId: string, userId: string): Promise<void> {
  const game = await updateGame(guildId, (g) => {
    if (g.phase !== 'day') return;
    const v = g.votes.find((vv) => vv.voterId === userId);
    if (v) v.locked = true;
  });
  if (!game) return;
  pushIf(guildId, game);

  // If every alive player has locked, resolve early.
  const alive = alivePlayers(game);
  const allLocked = alive.every((p) => game.votes.find((v) => v.voterId === p.userId && v.locked));
  if (allLocked) {
    void resolveDay(guildId, 'all-locked');
  }
}

async function resolveDay(guildId: string, reason: 'all-locked' | 'timeout'): Promise<void> {
  clearTimer(dayTimers, guildId);
  const game = await loadGame(guildId);
  if (!game || game.phase !== 'day') return;

  const alive = alivePlayers(game);
  const tally = new Map<string, number>();
  for (const v of game.votes) tally.set(v.targetId, (tally.get(v.targetId) ?? 0) + 1);

  const sorted = Array.from(tally.entries()).sort((a, b) => b[1] - a[1]);
  const majorityThreshold = Math.floor(alive.length / 2) + 1;
  let eliminatedId: string | null = null;
  if (sorted.length > 0) {
    const [topId, topCount] = sorted[0];
    const tied = sorted.length >= 2 && sorted[1][1] === topCount;
    if (topCount >= majorityThreshold) {
      eliminatedId = topId;
    } else if (reason === 'timeout' && !tied) {
      eliminatedId = topId;
    }
  }

  const updated = await updateGame(guildId, (g) => {
    if (eliminatedId) {
      const p = g.players[eliminatedId!];
      if (p && p.alive) {
        p.alive = false;
        g.history.push(`Day ${g.day}: ${p.tag} (${p.role}) eliminated.`);
      }
    } else {
      g.history.push(`Day ${g.day}: no elimination.`);
    }
  });
  if (!updated) return;
  pushIf(guildId, updated);

  const winner = checkWin(updated);
  if (winner) {
    await endGame(guildId, winner);
    return;
  }
  await startNight(guildId);
}

// ============================================================================
// Night
// ============================================================================

async function startNight(guildId: string): Promise<void> {
  const game = await updateGame(guildId, (g) => {
    g.phase = 'night';
    g.nightActions = [];
    g.phaseDeadline = new Date(Date.now() + NIGHT_DEADLINE_MS).toISOString();
  });
  if (!game) return;

  clearTimer(nightTimers, guildId);
  const t = setTimeout(() => {
    nightTimers.delete(guildId);
    void resolveNight(guildId);
  }, NIGHT_DEADLINE_MS);
  nightTimers.set(guildId, t);
  pushIf(guildId, game);
}

async function handleKill(guildId: string, actorId: string, targetId: string): Promise<void> {
  const game = await updateGame(guildId, (g) => {
    if (g.phase !== 'night') return;
    g.nightActions = g.nightActions.filter((a) => !(a.actorId === actorId && a.kind === 'kill'));
    g.nightActions.push({ actorId, kind: 'kill', targetId });
  });
  if (game) {
    pushIf(guildId, game);
    void checkNightComplete(guildId);
  }
}

async function handleSave(guildId: string, actorId: string, targetId: string): Promise<void> {
  const game = await updateGame(guildId, (g) => {
    if (g.phase !== 'night') return;
    g.nightActions = g.nightActions.filter((a) => !(a.actorId === actorId && a.kind === 'save'));
    g.nightActions.push({ actorId, kind: 'save', targetId });
  });
  if (game) {
    pushIf(guildId, game);
    void checkNightComplete(guildId);
  }
}

async function checkNightComplete(guildId: string): Promise<void> {
  const game = await loadGame(guildId);
  if (!game || game.phase !== 'night') return;
  const mafia = aliveByRole(game, 'mafia');
  const doctor = aliveByRole(game, 'doctor');
  const mafiaActed = mafia.every((p) =>
    game.nightActions.some((a) => a.actorId === p.userId && a.kind === 'kill'),
  );
  const doctorActed =
    doctor.length === 0 ||
    doctor.every((p) =>
      game.nightActions.some((a) => a.actorId === p.userId && a.kind === 'save'),
    );
  if (mafiaActed && doctorActed) {
    void resolveNight(guildId);
  }
}

async function resolveNight(guildId: string): Promise<void> {
  clearTimer(nightTimers, guildId);
  const game = await loadGame(guildId);
  if (!game || game.phase !== 'night') return;

  // Last kill / last save wins (matches existing /mafia behavior).
  const killActions = game.nightActions.filter((a) => a.kind === 'kill');
  const killTarget = killActions[killActions.length - 1]?.targetId ?? null;
  const saveActions = game.nightActions.filter((a) => a.kind === 'save');
  const saveTarget = saveActions[saveActions.length - 1]?.targetId ?? null;

  const updated = await updateGame(guildId, (g) => {
    if (killTarget && saveTarget !== killTarget) {
      const p = g.players[killTarget];
      if (p && p.alive) {
        p.alive = false;
        g.history.push(`Night ${g.day}: ${p.tag} (${p.role}) killed.`);
      }
    } else if (killTarget && saveTarget === killTarget) {
      g.history.push(`Night ${g.day}: an attack was thwarted.`);
    } else {
      g.history.push(`Night ${g.day}: the village slept peacefully.`);
    }
  });
  if (!updated) return;
  pushIf(guildId, updated);

  const winner = checkWin(updated);
  if (winner) {
    await endGame(guildId, winner);
    return;
  }
  await startDay(guildId);
}

// ============================================================================
// End
// ============================================================================

async function endGame(guildId: string, winner: 'town' | 'mafia'): Promise<void> {
  clearTimer(dayTimers, guildId);
  clearTimer(nightTimers, guildId);
  const game = await updateGame(guildId, (g) => {
    g.phase = 'finished';
    g.phaseDeadline = null;
    g.history.push(`Game ended: ${winner} wins on day ${g.day}.`);
  });
  if (!game) return;
  log.info(`game over in guild=${guildId}: ${winner}`);
  pushIf(guildId, game);

  // Keep the finished record briefly so the SPA can show the result screen,
  // then clear it so the channel can host a new game.
  setTimeout(() => {
    void setGame(guildId, null).then(() => pushIf(guildId, null));
  }, 30_000);
}

// ============================================================================
// External entry points
// ============================================================================

export async function applyAction(
  guildId: string,
  userId: string,
  action: PlayerAction,
): Promise<void> {
  switch (action.kind) {
    case 'vote':
      return handleVote(guildId, userId, action.targetId);
    case 'retract-vote':
      return handleRetract(guildId, userId);
    case 'lock-vote':
      return handleLock(guildId, userId);
    case 'kill':
      return handleKill(guildId, userId, action.targetId);
    case 'save':
      return handleSave(guildId, userId, action.targetId);
    case 'investigate':
      // Not in v1's 3-role subset; activity backend already rejects.
      return;
  }
}

export async function cancelByChannel(guildId: string, channelId: string): Promise<void> {
  const game = await loadGame(guildId);
  if (!game) return;
  if (game.starterChannelId !== channelId) return;
  log.info(`instance-ended cancels game in guild=${guildId}`);
  clearTimer(dayTimers, guildId);
  clearTimer(nightTimers, guildId);
  clearTimer(lobbyTimers, guildId);
  await setGame(guildId, null);
  pushIf(guildId, null);
}
