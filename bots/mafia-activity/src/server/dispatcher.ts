// SPA → bot dispatcher with server-side validation.
//
// Trust boundary: never forward an action without first verifying it against
// the latest game state for the socket's channel. See spec section
// "State sync protocol (WS) — Validation rules".

import { logger } from '@bots/shared';
import type { SpaInbound, SpaOutbound, MafiaGameWire, PlayerAction } from '@bots/shared';
import { setPostHelloHandler, sendToPlay, type PlaySocket } from './ws.ts';
import { sendToEngine, isEngineConnected } from './engine-link.ts';
import { getLatestState } from './instances.ts';

const log = logger.scoped('mafia-activity:dispatcher');

export function installDispatcher(): void {
  setPostHelloHandler((sock, msg) => {
    if (!isEngineConnected()) {
      reject(sock, msg.kind, 'engine-offline');
      return;
    }

    const { channelId, userId } = sock.session;

    switch (msg.kind) {
      case 'lobby-start':
        sendToEngine({
          kind: 'lobby-start',
          channelId,
          guildId: sock.session.guildId ?? '',
          hostUserId: userId,
          hostTag: sock.session.username,
        });
        break;

      case 'lobby-join':
        sendToEngine({
          kind: 'lobby-join',
          channelId,
          guildId: sock.session.guildId ?? '',
          userId,
          tag: sock.session.username,
        });
        break;

      case 'lobby-start-now':
        sendToEngine({ kind: 'lobby-start-now', channelId, userId });
        break;

      case 'action': {
        const state = getLatestState(channelId);
        const rejection = validateAction(state, userId, msg.action);
        if (rejection) {
          reject(sock, msg.kind, rejection);
          log.info(`action rejected: user=${userId} action=${msg.action.kind} reason=${rejection}`);
          return;
        }
        sendToEngine({ kind: 'action', channelId, userId, action: msg.action });
        break;
      }

      case 'hello':
        // already handled by ws.ts; duplicate hello is a protocol error
        reject(sock, 'hello', 'duplicate-hello');
        break;
    }
  });
}

function reject(sock: PlaySocket, originalKind: SpaOutbound['kind'], reason: string): void {
  const msg: SpaInbound = { kind: 'rejected', reason, originalKind };
  sendToPlay(sock.ws, msg);
}

// ============================================================================
// Validation
// ============================================================================

function validateAction(
  state: MafiaGameWire | null,
  userId: string,
  action: PlayerAction,
): string | null {
  if (!state) return 'no-game';
  const player = state.players[userId];
  if (!player) return 'not-a-player';
  if (!player.alive) return 'dead-cannot-act';

  const phase = state.phase;
  const targetMustBeAlive = (id: string) => {
    const t = state.players[id];
    return t && t.alive;
  };

  switch (action.kind) {
    case 'vote':
    case 'retract-vote':
    case 'lock-vote':
      if (phase !== 'day') return 'wrong-phase';
      if (action.kind === 'vote') {
        if (action.targetId === userId) return 'cannot-self-vote';
        if (!targetMustBeAlive(action.targetId)) return 'invalid-target';
      }
      if (action.kind === 'lock-vote') {
        const myVote = state.votes.find((v) => v.voterId === userId);
        if (!myVote) return 'no-vote-to-lock';
      }
      return null;

    case 'kill':
      if (phase !== 'night') return 'wrong-phase';
      if (player.role !== 'mafia') return 'wrong-role';
      if (!targetMustBeAlive(action.targetId)) return 'invalid-target';
      if (state.players[action.targetId]?.role === 'mafia') return 'cannot-kill-mafia';
      return null;

    case 'save':
      if (phase !== 'night') return 'wrong-phase';
      if (player.role !== 'doctor') return 'wrong-role';
      if (!targetMustBeAlive(action.targetId)) return 'invalid-target';
      return null;

    case 'investigate':
      // Detective deferred to a later milestone; reject for now.
      return 'not-implemented';
  }
}
