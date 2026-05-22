// Wire protocol shared by:
//   - bots/discord (engine, pushes state)
//   - bots/mafia-activity backend (BFF, redacts + validates)
//   - bots/mafia-activity SPA (receives redacted state)
//
// Keep MafiaGameWire structurally compatible with
// bots/discord/src/mafia/store.ts's MafiaGame. The bot casts to this type
// when pushing over WS; drift is a bug.

export type Role = 'mafia' | 'town' | 'doctor';
export type Phase = 'lobby' | 'day' | 'night' | 'finished';

export interface PlayerWire {
  userId: string;
  tag: string;
  role: Role | null;
  alive: boolean;
}

export interface DayVoteWire {
  voterId: string;
  targetId: string;
  locked?: boolean;
}

export interface NightActionWire {
  actorId: string;
  kind: 'kill' | 'save' | 'investigate';
  targetId: string;
}

export interface MafiaGameWire {
  guildId: string;
  threadId: string;
  starterId: string;
  starterChannelId: string;
  phase: Phase;
  day: number;
  players: Record<string, PlayerWire>;
  votes: DayVoteWire[];
  nightActions: NightActionWire[];
  history: string[];
  lobbyExpiresAt: string | null;
  phaseDeadline: string | null;
  createdAt: string;
}

// ============================================================================
// Bot ↔ activity backend (the /engine WS, bot is client, backend is server)
// ============================================================================

export type EngineOutbound =
  // bot → activity
  | { kind: 'engine-hello'; version: 1 }
  | { kind: 'state'; channelId: string; state: MafiaGameWire }
  | { kind: 'no-game'; channelId: string };

export type EngineInbound =
  // activity → bot
  | { kind: 'lobby-start'; channelId: string; guildId: string; hostUserId: string; hostTag: string }
  | { kind: 'lobby-join'; channelId: string; guildId: string; userId: string; tag: string }
  | { kind: 'lobby-start-now'; channelId: string; userId: string }
  | { kind: 'action'; channelId: string; userId: string; action: PlayerAction }
  | { kind: 'instance-ended'; channelId: string };

// ============================================================================
// SPA ↔ activity backend (the /play WS)
// ============================================================================

export type PlayerAction =
  | { kind: 'vote'; targetId: string }
  | { kind: 'retract-vote' }
  | { kind: 'lock-vote' }
  | { kind: 'kill'; targetId: string }
  | { kind: 'save'; targetId: string }
  | { kind: 'investigate'; targetId: string };

export type SpaOutbound =
  // SPA → activity
  | { kind: 'hello'; session: string }
  | { kind: 'lobby-start' }
  | { kind: 'lobby-join' }
  | { kind: 'lobby-start-now' }
  | { kind: 'action'; action: PlayerAction };

export type SpaInbound =
  // activity → SPA
  | { kind: 'hello-ack'; user: { id: string; username: string; avatar: string | null }; channelId: string }
  | { kind: 'hello-error'; reason: string }
  | { kind: 'state'; state: RedactedGame }
  | { kind: 'no-game' }
  | { kind: 'engine-offline' }
  | { kind: 'engine-online' }
  | { kind: 'rejected'; reason: string; originalKind?: string };

// What the SPA actually sees. Roles other than the viewer's own are stripped
// to null in `players`. Night-only fields (`nightActions`) are filtered to the
// viewer's role.
export interface RedactedGame {
  phase: Phase;
  day: number;
  players: Record<string, PlayerWire>; // role redacted per role rules
  votes: DayVoteWire[];
  history: string[];
  phaseDeadline: string | null;
  // Viewer-specific:
  you: {
    userId: string;
    role: Role | null;
    alive: boolean;
  };
  // Mafia-only: which other players are my mafia teammates
  coMafia?: string[];
  // Doctor/mafia-only during night phase
  nightTargets?: string[];
}
