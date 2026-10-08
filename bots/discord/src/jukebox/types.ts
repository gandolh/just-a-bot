/**
 * Atrium's Jukebox contract, as the bot uses it. Restated from atrium brief 81
 * (`packages/shared/src/jukebox.ts` in atrium); the two repos share no package,
 * so a change there needs a matching change here.
 */

export interface Track {
  id: string;
  title: string;
  artist: string | null;
  album: string | null;
  trackNumber: number | null;
  durationSeconds: number | null;
}

export interface VoiceChannelRef {
  id: string;
  name: string;
}

export interface JukeboxPlay {
  playId: number;
  track: Track;
  upcoming: Track[];
}

export type BotCommand = { id: number; guildId: string } & (
  | { kind: 'join'; channelId: string }
  | { kind: 'leave' }
  | ({ kind: 'play' } & JukeboxPlay)
  | { kind: 'pause' }
  | { kind: 'resume' }
  | { kind: 'stop' }
  | { kind: 'upcoming'; upcoming: Track[] }
);

/** `POST /jukebox/bot/status` body. */
export interface StatusReport {
  guildId: string;
  guildName: string;
  voiceChannel: VoiceChannelRef | null;
  voiceChannels: VoiceChannelRef[];
  playId: number;
  state: 'idle' | 'playing' | 'paused';
  positionMs: number;
}
