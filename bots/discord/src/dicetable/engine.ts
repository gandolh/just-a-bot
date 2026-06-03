// /dicetable engine — lobby → rolling → finished, plus coin handling.
//
// The engine OWNS the wallet (bots/discord/src/gambling/wallet.ts); the
// activity backend never touches balances. Antes are debited on create/join;
// the whole pot is credited to the winner(s) when the round resolves. If the
// table is cancelled before rolling, every ante is refunded.

import { logger } from '@bots/shared';
import { rollPair } from '../gambling/dice.ts';
import { credit, tryDebit } from '../gambling/wallet.ts';
import {
  type DiceGame,
  createGame,
  loadGame,
  setGame,
  updateGame,
} from './store.ts';

const log = logger.scoped('dicetable:engine');

const LOBBY_AUTO_ROLL_MS = 60_000;
const RESULT_LINGER_MS = 30_000;
const MIN_PLAYERS = 2;

const lobbyTimers = new Map<string, ReturnType<typeof setTimeout>>();
const resultTimers = new Map<string, ReturnType<typeof setTimeout>>();

type Pusher = (guildId: string, game: DiceGame | null) => void;
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

// ============================================================================
// Lobby
// ============================================================================

export async function handleCreate(
  guildId: string,
  channelId: string,
  hostUserId: string,
  hostTag: string,
  bet: number,
): Promise<void> {
  const existing = await loadGame(guildId);
  if (existing && existing.phase !== 'finished') {
    // A table is already open — ignore. UI shouldn't have offered create.
    return;
  }
  if (!Number.isInteger(bet) || bet < 1) return;

  // Host antes up front. If they can't cover it, don't open the table.
  const ok = await tryDebit(hostUserId, bet);
  if (!ok) {
    log.info(`create failed: ${hostTag} can't cover ante ${bet}`);
    return;
  }

  const game = createGame({ guildId, channelId, starterId: hostUserId, bet });
  game.players[hostUserId] = { userId: hostUserId, tag: hostTag, dice: null, total: null };
  game.pot = bet;
  await setGame(guildId, game);
  log.info(`table opened in guild=${guildId} channel=${channelId} by ${hostTag} (ante ${bet})`);
  scheduleLobbyAutoRoll(guildId);
  pushState(guildId, game);
}

export async function handleJoin(
  guildId: string,
  userId: string,
  tag: string,
): Promise<void> {
  const current = await loadGame(guildId);
  if (!current || current.phase !== 'lobby') return;
  if (current.players[userId]) return;

  // Debit the ante before adding the player. On failure, leave the table
  // untouched (the SPA's join is fire-and-forget; insufficient funds simply
  // means the player never appears).
  const ok = await tryDebit(userId, current.bet);
  if (!ok) {
    log.info(`join failed: ${tag} can't cover ante ${current.bet}`);
    return;
  }

  const game = await updateGame(guildId, (g) => {
    if (g.phase !== 'lobby' || g.players[userId]) return;
    g.players[userId] = { userId, tag, dice: null, total: null };
    g.pot += g.bet;
  });
  if (!game) {
    // Race: table changed between the debit and the update — refund.
    await credit(userId, current.bet);
    return;
  }
  log.info(`join: ${tag} (now ${Object.keys(game.players).length}, pot ${game.pot})`);
  pushState(guildId, game);
}

export async function handleRollNow(guildId: string, userId: string): Promise<void> {
  const game = await loadGame(guildId);
  if (!game || game.phase !== 'lobby') return;
  if (game.starterId !== userId) return;
  if (Object.keys(game.players).length < MIN_PLAYERS) return;
  await beginRound(guildId);
}

function scheduleLobbyAutoRoll(guildId: string): void {
  clearTimer(lobbyTimers, guildId);
  const t = setTimeout(() => {
    lobbyTimers.delete(guildId);
    void maybeAutoRoll(guildId);
  }, LOBBY_AUTO_ROLL_MS);
  lobbyTimers.set(guildId, t);
  // Record the deadline so the SPA can show a countdown.
  void updateGame(guildId, (g) => {
    if (g.phase === 'lobby') {
      g.phaseDeadline = new Date(Date.now() + LOBBY_AUTO_ROLL_MS).toISOString();
    }
  });
}

async function maybeAutoRoll(guildId: string): Promise<void> {
  const game = await loadGame(guildId);
  if (!game || game.phase !== 'lobby') return;
  if (Object.keys(game.players).length >= MIN_PLAYERS) {
    await beginRound(guildId);
  } else {
    // Not enough players → refund and close.
    log.info(`table auto-cancel in guild=${guildId} (only ${Object.keys(game.players).length})`);
    await refundAll(game);
    await setGame(guildId, null);
    pushState(guildId, null);
  }
}

// ============================================================================
// Rolling / resolution
// ============================================================================

async function beginRound(guildId: string): Promise<void> {
  clearTimer(lobbyTimers, guildId);

  // Roll everyone, find the highest total, split the pot among ties.
  const rolled = await updateGame(guildId, (g) => {
    g.phase = 'rolling';
    g.phaseDeadline = null;
    for (const p of Object.values(g.players)) {
      const r = rollPair();
      p.dice = r.dice;
      p.total = r.total;
    }
    const best = Math.max(...Object.values(g.players).map((p) => p.total ?? -1));
    g.winnerIds = Object.values(g.players)
      .filter((p) => p.total === best)
      .map((p) => p.userId);
  });
  if (!rolled) return;

  // Pay out: integer split, remainder goes to the first winner by join order.
  const winners = rolled.winnerIds;
  if (winners.length > 0) {
    const share = Math.floor(rolled.pot / winners.length);
    const remainder = rolled.pot - share * winners.length;
    for (let i = 0; i < winners.length; i++) {
      const amount = share + (i === 0 ? remainder : 0);
      if (amount > 0) await credit(winners[i], amount);
    }
  }

  const finished = await updateGame(guildId, (g) => {
    g.phase = 'finished';
    const names = g.winnerIds.map((id) => g.players[id]?.tag ?? id);
    if (g.winnerIds.length === 1) {
      g.history.push(`${names[0]} won the pot of ${g.pot}.`);
    } else if (g.winnerIds.length > 1) {
      g.history.push(`Tie — ${names.join(' & ')} split the pot of ${g.pot}.`);
    }
  });
  if (!finished) return;
  log.info(`round resolved in guild=${guildId}: winners=${finished.winnerIds.join(',')} pot=${finished.pot}`);
  pushState(guildId, finished);

  // Keep the finished record briefly so the SPA can show results, then clear
  // so the channel can host a new table.
  clearTimer(resultTimers, guildId);
  const t = setTimeout(() => {
    resultTimers.delete(guildId);
    void setGame(guildId, null).then(() => pushState(guildId, null));
  }, RESULT_LINGER_MS);
  resultTimers.set(guildId, t);
}

// ============================================================================
// Cancellation / refunds
// ============================================================================

async function refundAll(game: DiceGame): Promise<void> {
  for (const p of Object.values(game.players)) {
    await credit(p.userId, game.bet);
  }
}

export async function cancelByChannel(guildId: string, channelId: string): Promise<void> {
  const game = await loadGame(guildId);
  if (!game) return;
  if (game.starterChannelId !== channelId) return;
  log.info(`instance-ended cancels table in guild=${guildId}`);
  clearTimer(lobbyTimers, guildId);
  clearTimer(resultTimers, guildId);
  // Refund antes only if the round never resolved (winners haven't been paid).
  if (game.phase === 'lobby') {
    await refundAll(game);
  }
  await setGame(guildId, null);
  pushState(guildId, null);
}
