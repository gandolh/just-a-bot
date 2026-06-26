import type { Readable } from 'node:stream';
import type { Client } from 'discord.js';
import { Player, type Track } from 'discord-player';
import { DefaultExtractors, SoundCloudExtractor } from '@discord-player/extractor';
import { YoutubeExtractor } from 'discord-player-youtubei';
import ffmpegStatic from 'ffmpeg-static';
import youtubeDl from 'youtube-dl-exec';
import { logger } from '@bots/shared';
import { env } from './env.ts';

const log = logger.scoped('discord:player');

// --- Providers ---------------------------------------------------------------
// PRIMARY (temporary): SoundCloud. Streams natively via the bundled default
//   extractors — no yt-dlp, no auth, and not IP-blocked on our VPS.
// SECONDARY (DISABLED): YouTube via discord-player-youtubei + yt-dlp. Disabled
//   because YouTube blocks our VPS datacenter IP with "Sign in to confirm you're
//   not a bot". The code is kept and marked @deprecated; flip YOUTUBE_ENABLED
//   to re-enable once that's resolved (cookies/proxy/PO-token).
//   Tracking: corpus/todos/revisit-youtube-provider.md
const YOUTUBE_ENABLED: boolean = false;

const ffmpegPath = ffmpegStatic as unknown as string | null;
if (ffmpegPath) {
  process.env.FFMPEG_PATH = ffmpegPath;
}

/**
 * @deprecated YouTube streaming is disabled (see YOUTUBE_ENABLED) — YouTube
 * blocks our VPS IP. Kept for when it's re-enabled. Streams audio via yt-dlp.
 *
 * YouTube forces SABR + PO tokens on its innertube clients, so discord-player-
 * youtubei resolves metadata but its stream cascade can yield no audio. yt-dlp
 * extracts a working stream directly, bypassing that cascade.
 */
async function streamWithYtDlp(track: Track): Promise<Readable> {
  // Prefer Opus/WebM @ 48 kHz — Discord's native codec + sample rate — so
  // ffmpeg remuxes instead of transcoding from AAC (better quality, no resample).
  const format = track.live ? 'best[height<=360]' : 'bestaudio[acodec=opus]/bestaudio';
  const dl = youtubeDl.exec(track.url, {
    format,
    output: '-',
    noWarnings: true,
    noProgress: true,
    noPlaylist: true,
    quiet: true,
    // On flagged datacenter/VPS IPs YouTube returns "Sign in to confirm you're
    // not a bot" without authentication; a cookies.txt sidesteps it.
    ...(env.YT_COOKIES_FILE ? { cookies: env.YT_COOKIES_FILE } : {}),
  });
  // Surface the failure instead of leaving an unhandled rejection; the empty
  // stdout that follows makes discord-player skip the track gracefully.
  dl.catch((err) => log.error(`yt-dlp failed for "${track.title}"`, err));

  const stream = dl.stdout;
  if (!stream) throw new Error('yt-dlp produced no audio stream');

  const kill = () => {
    if (!dl.killed) {
      stream.removeAllListeners();
      dl.kill();
    }
  };
  stream.on('close', kill);
  stream.on('error', kill);
  stream.on('end', kill);
  return stream;
}

let player: Player | undefined;

export async function initPlayer(client: Client): Promise<Player> {
  if (player) return player;

  player = new Player(client as never);

  // Primary provider: SoundCloud (+ Spotify/Apple metadata bridges) from the
  // bundled default extractors. Bump SoundCloud's priority so it's preferred.
  await player.extractors.loadMulti(DefaultExtractors);
  const sc = player.extractors.get(SoundCloudExtractor.identifier);
  if (sc) sc.priority = 100;

  // Secondary provider: YouTube — DISABLED (see YOUTUBE_ENABLED note above).
  if (YOUTUBE_ENABLED) {
    await player.extractors.register(YoutubeExtractor, {
      ...(env.YT_COOKIE ? { cookie: env.YT_COOKIE } : {}),
      createStream: (track) => streamWithYtDlp(track),
    });
    const yt = player.extractors.get(YoutubeExtractor.identifier);
    if (yt) yt.priority = 50;
  }

  player.on('debug', (msg) => log.debug(`player: ${msg}`));
  player.events.on('debug', (_q, msg) => log.debug(`queue: ${msg}`));

  player.events.on('playerStart', (queue, track) => {
    log.info(`Now playing in ${queue.guild.name}: ${track.title}`);
    const interval = setInterval(() => {
      const q = queue;
      if (!q.currentTrack || q.currentTrack.id !== track.id) {
        clearInterval(interval);
        return;
      }
      const ms = q.node.estimatedDuration;
      const playedMs = q.node.streamTime;
      log.info(`progress: ${Math.floor(playedMs / 1000)}s / ${Math.floor(ms / 1000)}s — paused=${q.node.isPaused()}`);
    }, 5000);
  });
  player.events.on('audioTrackAdd', (queue, track) => {
    log.info(`Queued in ${queue.guild.name}: ${track.title}`);
  });
  player.events.on('disconnect', (queue) => {
    log.info(`Disconnected from voice in ${queue.guild.name}`);
  });
  player.events.on('emptyChannel', (queue) => {
    log.info(`Voice channel empty in ${queue.guild.name}; will leave after cooldown`);
  });
  player.events.on('emptyQueue', (queue) => {
    log.info(`Queue ended in ${queue.guild.name}`);
  });
  player.events.on('playerError', (queue, error) => {
    log.error(`Player error in ${queue.guild.name}`, error);
  });
  player.events.on('error', (queue, error) => {
    log.error(`Queue error in ${queue.guild.name}`, error);
  });
  player.events.on('playerSkip', (_q, track, reason) => {
    log.warn(`Skipped (auto) "${track.title}" — reason: ${reason}`);
  });
  player.events.on('playerFinish', (_q, track) => {
    log.info(`Finished: ${track.title}`);
  });

  return player;
}

export function getPlayer(): Player {
  if (!player) {
    throw new Error('Player not initialized. Call initPlayer(client) first.');
  }
  return player;
}
