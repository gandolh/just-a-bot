import type { Readable } from 'node:stream';
import type { Client } from 'discord.js';
import { Player, type Track } from 'discord-player';
import { DefaultExtractors } from '@discord-player/extractor';
import { YoutubeExtractor } from 'discord-player-youtubei';
import ffmpegStatic from 'ffmpeg-static';
import youtubeDl from 'youtube-dl-exec';
import { logger } from '@bots/shared';
import { env } from './env.ts';

const log = logger.scoped('discord:player');

const ffmpegPath = ffmpegStatic as unknown as string | null;
if (ffmpegPath) {
  process.env.FFMPEG_PATH = ffmpegPath;
}

// YouTube now forces SABR streaming + PO tokens on the innertube WEB/MWEB
// clients, which is why the bot would join voice and play nothing: discord-
// player-youtubei resolves metadata fine (so the track "queues"), but its
// youtubei.js stream cascade can hand back a stream that passes a HEAD check
// yet yields no audio. yt-dlp (bundled binary, kept current via `yt-dlp -U`)
// still extracts a working ANDROID_VR audio stream, so we stream through it
// directly instead of relying on the extractor's flaky client cascade.
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
  await player.extractors.register(YoutubeExtractor, {
    ...(env.YT_COOKIE ? { cookie: env.YT_COOKIE } : {}),
    createStream: (track) => streamWithYtDlp(track),
  });
  await player.extractors.loadMulti(DefaultExtractors);

  const yt = player.extractors.get(YoutubeExtractor.identifier);
  if (yt) yt.priority = 100;

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
