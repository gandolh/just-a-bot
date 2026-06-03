// Wire protocol shared by:
//   - bots/discord (engine, owns the wallet, pushes state)
//   - bots/dice-activity backend (BFF, validates + relays)
//   - bots/dice-activity SPA (receives state)
//
// Dice has NO hidden information: every player sees the same DiceGameWire.
// There is no redaction layer (unlike the old Mafia protocol) — the backend
// is a pure broadcast relay. Keep DiceGameWire structurally compatible with
// bots/discord/src/dicetable/store.ts's DiceGame; the bot casts to this type
// when pushing over WS.

export type Phase = 'lobby' | 'rolling' | 'finished';

export interface DicePlayer {
  userId: string;
  tag: string;
  dice: [number, number] | null; // null until the round is rolled
  total: number | null;
}

export interface DiceGameWire {
  guildId: string;
  starterId: string;
  starterChannelId: string;
  phase: Phase;
  bet: number; // coins each player antes
  pot: number; // total wagered (bet * playerCount)
  players: Record<string, DicePlayer>;
  winnerIds: string[]; // set when phase === 'finished'
  history: string[];
  phaseDeadline: string | null;
  createdAt: string;
}

// ============================================================================
// Bot ↔ activity backend (the /engine WS, bot is client, backend is server)
// ============================================================================

export type EngineOutbound =
  // bot → activity
  | { kind: 'engine-hello'; version: 1 }
  | { kind: 'state'; channelId: string; state: DiceGameWire }
  | { kind: 'no-game'; channelId: string };

export type EngineInbound =
  // activity → bot
  | { kind: 'create'; channelId: string; guildId: string; userId: string; tag: string; bet: number }
  | { kind: 'join'; channelId: string; guildId: string; userId: string; tag: string }
  | { kind: 'roll-now'; channelId: string; userId: string }
  | { kind: 'instance-ended'; channelId: string };

// ============================================================================
// SPA ↔ activity backend (the /play WS)
// ============================================================================

export type SpaOutbound =
  // SPA → activity
  | { kind: 'hello'; session: string }
  | { kind: 'create'; bet: number } // open a new table with a fixed ante
  | { kind: 'join' } // join the open table
  | { kind: 'roll-now' }; // host forces the round to roll

export type SpaInbound =
  // activity → SPA
  | { kind: 'hello-ack'; user: { id: string; username: string; avatar: string | null }; channelId: string }
  | { kind: 'hello-error'; reason: string }
  | { kind: 'state'; state: DiceGameWire }
  | { kind: 'no-game' }
  | { kind: 'engine-offline' }
  | { kind: 'engine-online' }
  | { kind: 'rejected'; reason: string; originalKind?: string };
