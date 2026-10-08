import { Readable } from 'node:stream';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import { logger } from '@bots/shared';
import { atriumFetch, atriumStream, isPermanentJukeboxError, JukeboxForbidden } from './atrium/client.ts';
import { isJukeboxConfigured } from './atrium/config.ts';
import { TrackBuffer, wipeBuffers } from './buffer.ts';
import { GuildPlayer, type PlayerApi } from './player.ts';
import type { JukeboxHost } from './speaker.ts';
import type { BotCommand, JukeboxPlay, Track } from './types.ts';

const log = logger.scoped('jukebox');

/**
 * The link to atrium (brief 26). The bot binds no port, so it holds one
 * long-poll open on `GET /jukebox/bot/commands` and does what the commands say.
 * Atrium owns every Player (D57 there); the bot reports what it is doing and
 * asks atrium what plays next.
 *
 * Atrium's rules this follows (brief 26's note from atrium brief 82):
 * - The cursor is taken **once**, at start. A poll without `after` is how
 *   atrium learns the bot restarted, and it idles every Player, so a reconnect
 *   keeps the cursor it has.
 * - Commands for one guild run in order; a `play` after a `join` waits for the
 *   voice connection.
 */

/** Atrium's longest `wait` (its brief 81 outcome: 20 s held through Vite and the container). */
const POLL_WAIT_S = 20;
const POLL_TIMEOUT_MS = (POLL_WAIT_S + 10) * 1000;
const BACKOFF_FIRST_MS = 1_000;
const BACKOFF_MAX_MS = 30_000;
/** How often a playing guild reports its position. */
const PLAYING_REPORT_MS = 10_000;
/** How long the headers of a Track's file may take. The body streams for as long as it plays. */
const FILE_HEADERS_TIMEOUT_MS = 15_000;

export interface JukeboxLink {
  /** Leave every voice channel and report idle, best effort. The caller bounds the wait. */
  stop(): Promise<void>;
}

interface CommandsAnswer {
  cursor: number;
  commands: BotCommand[];
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => (clearTimeout(timer), resolve()), { once: true });
  });

/**
 * Start the link if the Jukebox is configured, else do nothing (it reports
 * "not configured" in `/jukebox` instead). Never throws: every failure is
 * logged, and the permanent ones (sign-in failed, forbidden) stop the link.
 */
export function startJukeboxLink(host: JukeboxHost): JukeboxLink | null {
  if (!isJukeboxConfigured()) {
    log.info('Jukebox not configured (no JUKEBOX_* variables); the link is off');
    return null;
  }

  const stopping = new AbortController();
  const players = new Map<string, GuildPlayer>();
  const reports = new Map<string, Promise<void>>();
  let stopped = false;

  const api: PlayerApi = {
    advance: (guildId, playId, reason) =>
      atriumFetch<{ play: JukeboxPlay | null; stale?: true }>(`/jukebox/bot/players/${guildId}/advance`, {
        method: 'POST',
        json: { playId, reason },
      }),
    control: async (guildId, action) => {
      await atriumFetch(`/jukebox/players/${guildId}/control`, { method: 'POST', json: { action } });
    },
    report: (guildId) => void report(guildId),
  };

  const fetchTrack = async (trackId: string, signal: AbortSignal): Promise<Readable> => {
    const response = await atriumStream(`/library/${trackId}/file`, { signal, timeoutMs: FILE_HEADERS_TIMEOUT_MS });
    if (!response.body) throw new Error(`atrium sent no body for ${trackId}`);
    return Readable.fromWeb(response.body as WebReadableStream<Uint8Array>);
  };

  function playerFor(guildId: string): GuildPlayer {
    let player = players.get(guildId);
    if (!player) {
      player = new GuildPlayer(guildId, host.speaker(guildId), new TrackBuffer(guildId, fetchTrack), api);
      players.set(guildId, player);
    }
    return player;
  }

  /** Tell atrium what one guild is doing. Reports for a guild go out one at a time, the latest state each. */
  function report(guildId: string): Promise<void> {
    const previous = reports.get(guildId) ?? Promise.resolve();
    const next = previous.then(async () => {
      const player = players.get(guildId);
      if (!player) return;
      try {
        const answer = await atriumFetch<{ upcoming: Track[] }>('/jukebox/bot/status', {
          method: 'POST',
          json: player.status(),
        });
        if (!stopped) player.setUpcoming(answer.upcoming);
      } catch (err) {
        if (!stopped) log.warn(`reporting status for ${guildId} failed: ${(err as Error).message}`);
      }
    });
    reports.set(guildId, next);
    void next.finally(() => {
      if (reports.get(guildId) === next) reports.delete(guildId);
    });
    return next;
  }

  const ticker = setInterval(() => {
    for (const [guildId, player] of players) if (player.playing) void report(guildId);
  }, PLAYING_REPORT_MS);
  ticker.unref();

  /** Log a failure, and say whether the link should keep going. */
  function survive(err: unknown, what: string): boolean {
    if (isPermanentJukeboxError(err)) {
      const hint =
        err instanceof JukeboxForbidden
          ? `atrium refused the Bot account (${err.code ?? 'no code'}); check its Ward grant is atrium:jukebox`
          : (err as Error).message;
      log.error(`Jukebox link stopped: ${hint}`);
      return false;
    }
    log.warn(`atrium unreachable while ${what} (${(err as Error).message})`);
    return true;
  }

  async function run(): Promise<void> {
    await wipeBuffers();
    let backoff = 0;
    const waitBackoff = async () => {
      backoff = backoff === 0 ? BACKOFF_FIRST_MS : Math.min(backoff * 2, BACKOFF_MAX_MS);
      log.warn(`Jukebox link retrying in ${backoff / 1000} s`);
      await sleep(backoff, stopping.signal);
    };

    // The cursor, once. This is also how atrium learns the bot restarted.
    let cursor: number | null = null;
    while (cursor === null && !stopped) {
      try {
        cursor = (await atriumFetch<CommandsAnswer>('/jukebox/bot/commands', { signal: stopping.signal })).cursor;
      } catch (err) {
        if (stopped || !survive(err, 'taking the command cursor')) return;
        await waitBackoff();
      }
    }
    if (cursor === null) return;
    backoff = 0;
    log.info(`Jukebox link up; command cursor ${cursor}`);

    // One idle report per guild: it registers the Players and their channels.
    await Promise.all(host.guilds().map((guild) => report(playerFor(guild.id).guildId)));

    while (!stopped) {
      try {
        const answer: CommandsAnswer = await atriumFetch<CommandsAnswer>(`/jukebox/bot/commands?after=${cursor}&wait=${POLL_WAIT_S}`, {
          timeoutMs: POLL_TIMEOUT_MS,
          signal: stopping.signal,
        });
        if (backoff !== 0) log.info('Jukebox link back');
        backoff = 0;
        for (const command of answer.commands) playerFor(command.guildId).apply(command);
        cursor = answer.cursor;
      } catch (err) {
        if (stopped || !survive(err, 'waiting for commands')) return;
        await waitBackoff();
      }
    }
  }

  void run().catch((err) => log.error('Jukebox link crashed', err));

  return {
    async stop() {
      stopped = true;
      stopping.abort();
      clearInterval(ticker);
      // Leave voice first, then say so: no voice on the current play is how
      // atrium hears that the bot is gone.
      await Promise.allSettled(
        [...players.values()].map(async (player) => {
          await player.shutdown();
          await report(player.guildId);
        }),
      );
    },
  };
}
