import { logger } from '@bots/shared';
import { AloneWatch } from './alone.ts';
import type { OpenTrack, TrackBuffer } from './buffer.ts';
import type { Speaker } from './speaker.ts';
import type { BotCommand, JukeboxPlay, StatusReport, Track } from './types.ts';

const log = logger.scoped('jukebox');

/**
 * Whether a `play` should replace what is playing. Atrium raises `playId`
 * every time a Track starts, so a lower or equal one is old news: a command
 * that lost a race with `advance`, or a repeat delivered twice. The first
 * `play` after boot always applies, because the bot has no `playId` yet.
 */
export function shouldApplyPlay(current: number | null, incoming: number): boolean {
  return current === null || incoming > current;
}

/** The atrium calls a guild's player makes. The link supplies them. */
export interface PlayerApi {
  advance(guildId: string, playId: number, reason: 'ended' | 'error'): Promise<{ play: JukeboxPlay | null; stale?: true }>;
  control(guildId: string, action: 'pause' | 'leave'): Promise<void>;
  report(guildId: string): void;
}

/**
 * One guild's speaker, steered by atrium (brief 26). It keeps no Player state
 * of its own beyond what it is doing right now: which play, which Track, and
 * whether it is playing. Commands run one at a time, in order, so a `play`
 * that follows a `join` waits for the voice connection.
 */
export class GuildPlayer {
  private playId: number | null = null;
  private state: 'idle' | 'playing' | 'paused' = 'idle';
  private track: Track | null = null;
  private upcoming: Track[] = [];
  private current: OpenTrack | null = null;
  private chain: Promise<void> = Promise.resolve();
  private readonly alone: AloneWatch;

  constructor(
    readonly guildId: string,
    private readonly speaker: Speaker,
    private readonly buffer: TrackBuffer,
    private readonly api: PlayerApi,
  ) {
    this.alone = new AloneWatch({
      pause: () => void this.api.control(this.guildId, 'pause').catch((err) => log.warn(`pausing an empty channel failed: ${err.message}`)),
      leave: () => void this.api.control(this.guildId, 'leave').catch((err) => log.warn(`leaving an empty channel failed: ${err.message}`)),
    });
    speaker.setHandlers({
      ended: () => this.enqueue(() => this.finished(this.current?.failed() ? 'error' : 'ended')),
      error: (err) => {
        log.warn(`playback failed in ${this.guildId}: ${err.message}`);
        this.enqueue(() => this.finished('error'));
      },
      listeners: (humans) => this.alone.update(humans),
      channels: () => this.api.report(this.guildId),
      disconnected: () => {
        // Kicked, or the channel went away. Atrium hears "no voice on the
        // current play" and sets the Player idle.
        this.alone.reset();
        this.state = 'idle';
        this.api.report(this.guildId);
      },
    });
  }

  /** What `POST /jukebox/bot/status` sends for this guild. */
  status(): StatusReport {
    return {
      guildId: this.guildId,
      guildName: this.speaker.guildName(),
      voiceChannel: this.speaker.connected(),
      voiceChannels: this.speaker.voiceChannels(),
      playId: this.playId ?? 0,
      state: this.state,
      positionMs: Math.floor(this.speaker.positionMs()),
    };
  }

  get playing(): boolean {
    return this.state === 'playing';
  }

  /** Run a command after the ones before it. */
  apply(command: BotCommand): void {
    this.enqueue(() => this.run(command));
  }

  /** What plays next, from a status answer. */
  setUpcoming(upcoming: Track[]): void {
    this.upcoming = upcoming;
    this.buffer.update(this.track?.id ?? null, upcoming.map((t) => t.id));
  }

  private enqueue(work: () => Promise<void>): void {
    this.chain = this.chain.then(work).catch((err: Error) => log.error(`jukebox command failed in ${this.guildId}`, err));
  }

  private async run(command: BotCommand): Promise<void> {
    switch (command.kind) {
      case 'join':
        try {
          await this.speaker.join(command.channelId);
        } catch (err) {
          log.warn(`joining voice in ${this.guildId} failed: ${(err as Error).message}`);
        }
        break;
      case 'leave':
        this.speaker.leave();
        this.alone.reset();
        this.idle();
        break;
      case 'play':
        await this.start(command);
        return; // `start` reports.
      case 'pause':
        if (this.state === 'playing') {
          this.speaker.pause();
          this.state = 'paused';
        }
        break;
      case 'resume':
        if (this.state === 'paused') {
          this.speaker.resume();
          this.state = 'playing';
        }
        break;
      case 'stop':
        this.speaker.stop();
        this.idle();
        break;
      case 'upcoming':
        this.setUpcoming(command.upcoming);
        return; // Nothing atrium needs to hear.
    }
    this.api.report(this.guildId);
  }

  private idle(): void {
    this.state = 'idle';
    this.track = null;
    this.current = null;
    this.buffer.update(null, this.upcoming.map((t) => t.id));
  }

  /** Start a play from a command or an `advance` answer, if it is newer than the current one. */
  private async start(play: JukeboxPlay): Promise<void> {
    if (!shouldApplyPlay(this.playId, play.playId)) return;
    this.playId = play.playId;
    this.track = play.track;
    this.upcoming = play.upcoming;
    if (!this.speaker.connected()) {
      // No voice channel to play in. Report idle for this play, and atrium
      // sets the Player idle.
      this.speaker.stop();
      this.idle();
      this.api.report(this.guildId);
      return;
    }
    this.buffer.update(play.track.id, play.upcoming.map((t) => t.id));
    try {
      this.current = await this.buffer.open(play.track.id);
      this.speaker.play(this.current.stream);
      this.state = 'playing';
      log.info(`playing "${play.track.title}" in ${this.guildId} (${this.current.live ? 'live' : 'buffered'})`);
    } catch (err) {
      log.warn(`could not open "${play.track.title}": ${(err as Error).message}`);
      this.state = 'idle';
      this.api.report(this.guildId);
      // Atrium could not hand over the file; ask for the next one.
      await this.finished('error');
      return;
    }
    this.api.report(this.guildId);
  }

  /**
   * The current Track ended or failed: ask atrium what plays next. If atrium
   * cannot be reached, ask again later, outside the command chain so a newer
   * command is never held up; a newer `play` makes the retry moot.
   */
  private async finished(reason: 'ended' | 'error', attempt = 0): Promise<void> {
    if (this.playId === null) return;
    const playId = this.playId;
    this.state = 'idle';
    let answer: Awaited<ReturnType<PlayerApi['advance']>>;
    try {
      answer = await this.api.advance(this.guildId, playId, reason);
    } catch (err) {
      const delay = Math.min(1_000 * 2 ** attempt, 30_000);
      log.warn(`asking atrium for the next Track failed (${(err as Error).message}); retrying in ${delay / 1000} s`);
      setTimeout(() => {
        // Not if a newer play started, or a stop or leave cleared the Track meanwhile.
        if (this.playId === playId && this.state === 'idle' && this.track !== null) {
          this.enqueue(() => this.finished(reason, attempt + 1));
        }
      }, delay).unref();
      return;
    }
    if (answer.play) return this.start(answer.play);
    if (answer.stale) return; // A newer `play` is on its way down the long-poll.
    this.idle();
    this.api.report(this.guildId);
  }

  /** Leave voice and forget the buffer: shutdown. */
  async shutdown(): Promise<void> {
    this.alone.reset();
    this.speaker.leave();
    this.state = 'idle';
    await this.buffer.clear();
  }
}
