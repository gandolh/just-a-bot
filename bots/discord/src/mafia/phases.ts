import type { Client } from 'discord.js';
import { loadGame, updateGame } from './store.ts';
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

// Track active deadline timers so they can be cancelled
const dayTimers = new Map<string, ReturnType<typeof setTimeout>>();
const nightTimers = new Map<string, ReturnType<typeof setTimeout>>();

export async function startDay(client: Client, guildId: string): Promise<void> {
  const game = await updateGame(guildId, (g) => {
    g.phase = 'day';
    g.day += 1;
    g.votes = [];
    g.phaseDeadline = new Date(Date.now() + 5 * 60_000).toISOString();
  });
  if (!game) return;

  await postToThread(client, game, { embeds: [dayEmbed(game)] });

  const timer = setTimeout(() => {
    dayTimers.delete(guildId);
    void resolveDay(client, guildId);
  }, 5 * 60_000);
  dayTimers.set(guildId, timer);
}

export async function resolveDay(client: Client, guildId: string): Promise<void> {
  clearTimer(dayTimers, guildId);

  const game = await loadGame(guildId);
  if (!game || game.phase !== 'day') return;

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
    g.phaseDeadline = new Date(Date.now() + 2 * 60_000).toISOString();
  });
  if (!game) return;

  await postToThread(client, game, { embeds: [nightEmbed(game)] });
  await sendNightActionDms(client, game);

  const timer = setTimeout(() => {
    nightTimers.delete(guildId);
    void resolveNight(client, guildId);
  }, 2 * 60_000);
  nightTimers.set(guildId, timer);
}

export async function resolveNight(client: Client, guildId: string): Promise<void> {
  clearTimer(nightTimers, guildId);

  const game = await loadGame(guildId);
  if (!game || game.phase !== 'night') return;

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
