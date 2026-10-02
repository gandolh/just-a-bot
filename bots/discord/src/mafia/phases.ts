import type { Client } from 'discord.js';
import { listPersistedGames, loadGame, updateGame } from './store.ts';
import type { MafiaGame, Player } from './store.ts';
import { alivePlayers, aliveByRole, checkWin } from './roles.ts';
import {
  dayEmbed,
  eliminatedEmbed,
  nightEmbed,
  nightResultEmbed,
  winEmbed,
} from './render.ts';
import { postToThread, sendNightActionDms } from './dm.ts';

const DAY_MS = 5 * 60_000;
const NIGHT_MS = 2 * 60_000;

// Track active deadline timers so they can be cancelled. All three are keyed by
// guild, and arming one always clears the previous handle first: an overwritten
// handle is a timer nobody can cancel, which later fires into the wrong phase.
const dayTimers = new Map<string, ReturnType<typeof setTimeout>>();
const nightTimers = new Map<string, ReturnType<typeof setTimeout>>();
const lobbyTimers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Phase resolutions in flight, as `${guildId}:day` / `${guildId}:night`.
 *
 * The phase only changes inside `startNight`/`startDay`, several awaits after a
 * resolution begins, and `loadGame` hands every caller the same cached object.
 * So two votes that both reach the majority, or a double-clicked night action,
 * used to resolve the same phase twice: a second "no majority" post, a second
 * round of night DMs, a skipped day number, an orphaned timer. The claim is
 * taken synchronously after the phase check, before any await, which makes the
 * check-and-claim atomic. It lives in memory because the cached game does too:
 * a restart clears both. Day and night are claimed separately so a night that
 * completes while `resolveDay` is still sending night DMs is not dropped.
 */
const resolving = new Set<string>();

function armDayTimer(client: Client, guildId: string, ms: number): void {
  clearTimer(dayTimers, guildId);
  dayTimers.set(guildId, setTimeout(() => {
    dayTimers.delete(guildId);
    void resolveDay(client, guildId);
  }, ms));
}

function armNightTimer(client: Client, guildId: string, ms: number): void {
  clearTimer(nightTimers, guildId);
  nightTimers.set(guildId, setTimeout(() => {
    nightTimers.delete(guildId);
    void resolveNight(client, guildId);
  }, ms));
}

/** Arm (or re-arm) a lobby's expiry. `fire` must check it still has the same
 * game — see `lobbyExpire` in `commands/mafia.ts`. */
export function armLobbyTimer(guildId: string, ms: number, fire: () => void): void {
  clearTimer(lobbyTimers, guildId);
  lobbyTimers.set(guildId, setTimeout(() => {
    lobbyTimers.delete(guildId);
    fire();
  }, ms));
}

export function clearLobbyTimer(guildId: string): void {
  clearTimer(lobbyTimers, guildId);
}

export async function startDay(client: Client, guildId: string): Promise<void> {
  const game = await updateGame(guildId, (g) => {
    g.phase = 'day';
    g.day += 1;
    g.votes = [];
    g.phaseDeadline = new Date(Date.now() + DAY_MS).toISOString();
  });
  if (!game) return;

  await postToThread(client, game, { embeds: [dayEmbed(game)] });
  armDayTimer(client, guildId, DAY_MS);
}

export async function resolveDay(client: Client, guildId: string): Promise<void> {
  const game = await loadGame(guildId);
  if (!game || game.phase !== 'day') return;
  const claim = `${guildId}:day`;
  if (resolving.has(claim)) return;
  resolving.add(claim);
  try {
    clearTimer(dayTimers, guildId);
    await resolveClaimedDay(client, guildId, game);
  } finally {
    resolving.delete(claim);
  }
}

async function resolveClaimedDay(client: Client, guildId: string, game: MafiaGame): Promise<void> {

  const alive = alivePlayers(game);
  const threshold = Math.floor(alive.length / 2) + 1;

  const tally = new Map<string, number>();
  for (const v of game.votes) {
    tally.set(v.targetId, (tally.get(v.targetId) ?? 0) + 1);
  }

  let eliminated: Player | null = null;
  for (const [targetId, count] of tally.entries()) {
    if (count >= threshold) {
      const p = game.players[targetId];
      if (p && p.alive) { eliminated = p; break; }
    }
  }

  // No majority: pick the player with most votes; ties → no elimination
  if (!eliminated && tally.size > 0) {
    const sorted = Array.from(tally.entries()).sort((a, b) => b[1] - a[1]);
    if (sorted.length >= 2 && sorted[0][1] === sorted[1][1]) {
      eliminated = null; // tied, no one eliminated
    } else {
      const p = game.players[sorted[0][0]];
      if (p && p.alive) eliminated = p;
    }
  }

  if (eliminated) {
    await updateGame(guildId, (g) => {
      g.players[eliminated!.userId].alive = false;
      g.history.push(`Day ${g.day}: ${eliminated!.tag} (${eliminated!.role}) eliminated.`);
    });
    await postToThread(client, game, { embeds: [eliminatedEmbed(eliminated, game)] });
  } else {
    await postToThread(client, game, {
      content: '🗳️ No majority reached — the day ends without an elimination.',
    });
  }

  const updated = await loadGame(guildId);
  if (!updated) return;

  const winner = checkWin(updated);
  if (winner) {
    await endGame(client, guildId, winner);
    return;
  }

  await startNight(client, guildId);
}

export async function startNight(client: Client, guildId: string): Promise<void> {
  const game = await updateGame(guildId, (g) => {
    g.phase = 'night';
    g.nightActions = [];
    g.phaseDeadline = new Date(Date.now() + NIGHT_MS).toISOString();
  });
  if (!game) return;

  await postToThread(client, game, { embeds: [nightEmbed(game)] });
  await sendNightActionDms(client, game);
  armNightTimer(client, guildId, NIGHT_MS);
}

export async function resolveNight(client: Client, guildId: string): Promise<void> {
  const game = await loadGame(guildId);
  if (!game || game.phase !== 'night') return;
  const claim = `${guildId}:night`;
  if (resolving.has(claim)) return;
  resolving.add(claim);
  try {
    clearTimer(nightTimers, guildId);
    await resolveClaimedNight(client, guildId, game);
  } finally {
    resolving.delete(claim);
  }
}

async function resolveClaimedNight(client: Client, guildId: string, game: MafiaGame): Promise<void> {

  const killAction = game.nightActions.find((a) => a.kind === 'kill');
  const saveAction = game.nightActions.find((a) => a.kind === 'save');

  let killed: Player | null = null;
  let savedMessage = false;

  if (killAction) {
    const target = game.players[killAction.targetId];
    if (target && target.alive) {
      if (saveAction && saveAction.targetId === killAction.targetId) {
        savedMessage = true;
      } else {
        killed = target;
      }
    }
  }

  if (killed) {
    await updateGame(guildId, (g) => {
      g.players[killed!.userId].alive = false;
      g.history.push(`Night ${g.day}: ${killed!.tag} (${killed!.role}) killed.`);
    });
  }

  await postToThread(client, game, { embeds: [nightResultEmbed(killed, savedMessage)] });

  const updated = await loadGame(guildId);
  if (!updated) return;

  const winner = checkWin(updated);
  if (winner) {
    await endGame(client, guildId, winner);
    return;
  }

  await startDay(client, guildId);
}

export async function endGame(
  client: Client,
  guildId: string,
  winner: 'town' | 'mafia',
): Promise<void> {
  clearTimer(dayTimers, guildId);
  clearTimer(nightTimers, guildId);

  const game = await updateGame(guildId, (g) => {
    g.phase = 'finished';
    g.history.push(`Game ended: ${winner} wins on day ${g.day}.`);
  });
  if (!game) return;

  await postToThread(client, game, { embeds: [winEmbed(winner, game)] });
}

export function cancelTimers(guildId: string): void {
  clearTimer(dayTimers, guildId);
  clearTimer(nightTimers, guildId);
  clearTimer(lobbyTimers, guildId);
}

/**
 * Re-arm every persisted game's timer at boot. Timers live in process memory,
 * so after a deploy or crash a game mid-day never ended and `/mafia start` kept
 * answering "already running". The deadlines are persisted; a deadline that
 * passed while the bot was down resolves now.
 */
export async function rearmMafiaTimers(client: Client): Promise<void> {
  const remaining = (iso: string | null, fallback: number) =>
    iso === null ? fallback : Math.max(0, new Date(iso).getTime() - Date.now());

  for (const game of await listPersistedGames()) {
    const { guildId } = game;
    if (game.phase === 'lobby') {
      const { armLobbyExpiry } = await import('../commands/mafia.ts');
      armLobbyExpiry(client, game, remaining(game.lobbyExpiresAt, 0));
    } else if (game.phase === 'day') {
      const ms = remaining(game.phaseDeadline, DAY_MS);
      if (ms === 0) void resolveDay(client, guildId);
      else armDayTimer(client, guildId, ms);
    } else if (game.phase === 'night') {
      const ms = remaining(game.phaseDeadline, NIGHT_MS);
      if (ms === 0) void resolveNight(client, guildId);
      else armNightTimer(client, guildId, ms);
    }
  }
}

function clearTimer(map: Map<string, ReturnType<typeof setTimeout>>, key: string): void {
  const t = map.get(key);
  if (t !== undefined) {
    clearTimeout(t);
    map.delete(key);
  }
}

export async function checkNightComplete(client: Client, guildId: string): Promise<void> {
  const game = await loadGame(guildId);
  if (!game || game.phase !== 'night') return;

  const alive = alivePlayers(game);
  const aliveMafia = aliveByRole(game, 'mafia');
  const aliveDoctor = aliveByRole(game, 'doctor');

  const mafiaVoted = aliveMafia.every((p) =>
    game.nightActions.some((a) => a.actorId === p.userId && a.kind === 'kill'),
  );
  const doctorSaved = aliveDoctor.length === 0 ||
    aliveDoctor.every((p) =>
      game.nightActions.some((a) => a.actorId === p.userId && a.kind === 'save'),
    );

  if (mafiaVoted && doctorSaved) {
    await resolveNight(client, guildId);
  }
}
