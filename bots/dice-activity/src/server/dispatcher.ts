// SPA → bot dispatcher with server-side validation.
//
// Trust boundary: never forward an action without first verifying it against
// the latest game state for the socket's channel. The bot engine owns the
// wallet and performs the actual coin debit/credit; the backend only checks
// phase/membership/host preconditions so we don't spam the engine with
// obviously-invalid requests.

import { logger } from '@bots/shared';
import type { SpaInbound, SpaOutbound, DiceGameWire } from '@bots/shared';
import { setPostHelloHandler, sendToPlay, type PlaySocket } from './ws.ts';
import { sendToEngine, isEngineConnected } from './engine-link.ts';
import { getLatestState } from './instances.ts';

const log = logger.scoped('dice-activity:dispatcher');

const MIN_PLAYERS = 2;

export function installDispatcher(): void {
  setPostHelloHandler((sock, msg) => {
    if (!isEngineConnected()) {
      reject(sock, msg.kind, 'engine-offline');
      return;
    }

    const { channelId, userId } = sock.session;
    const state = getLatestState(channelId);

    switch (msg.kind) {
      case 'create': {
        if (state && state.phase !== 'finished') {
          reject(sock, msg.kind, 'table-already-open');
          return;
        }
        if (!Number.isInteger(msg.bet) || msg.bet < 1) {
          reject(sock, msg.kind, 'invalid-bet');
          return;
        }
        sendToEngine({
          kind: 'create',
          channelId,
          guildId: sock.session.guildId ?? '',
          userId,
          tag: sock.session.username,
          bet: msg.bet,
        });
        break;
      }

      case 'join': {
        if (!state || state.phase !== 'lobby') {
          reject(sock, msg.kind, 'no-open-table');
          return;
        }
        if (state.players[userId]) {
          reject(sock, msg.kind, 'already-joined');
          return;
        }
        sendToEngine({
          kind: 'join',
          channelId,
          guildId: sock.session.guildId ?? '',
          userId,
          tag: sock.session.username,
        });
        break;
      }

      case 'roll-now': {
        if (!state || state.phase !== 'lobby') {
          reject(sock, msg.kind, 'wrong-phase');
          return;
        }
        if (state.starterId !== userId) {
          reject(sock, msg.kind, 'host-only');
          return;
        }
        if (Object.keys(state.players).length < MIN_PLAYERS) {
          reject(sock, msg.kind, 'need-more-players');
          return;
        }
        sendToEngine({ kind: 'roll-now', channelId, userId });
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
  log.info(`rejected ${originalKind}: ${reason}`);
}

// Re-exported for potential future use / parity with the old module shape.
export type { DiceGameWire };
