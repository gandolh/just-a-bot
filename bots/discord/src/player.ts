import type { Client } from 'discord.js';
import { Player } from 'discord-player';
import { DefaultExtractors } from '@discord-player/extractor';
import { YoutubeiExtractor } from 'discord-player-youtubei';
import ffmpegStatic from 'ffmpeg-static';
import { logger } from '@bots/shared';

const log = logger.scoped('discord:player');

const ffmpegPath = ffmpegStatic as unknown as string | null;
if (ffmpegPath) {
  process.env.FFMPEG_PATH = ffmpegPath;
}

let player: Player | undefined;

export async function initPlayer(client: Client): Promise<Player> {
  if (player) return player;

  player = new Player(client as never);
  await player.extractors.register(YoutubeiExtractor, {
    generateWithPoToken: true,
    useYoutubeDL: true,
    streamOptions: { useClient: 'WEB_EMBEDDED' },
  });
  await player.extractors.loadMulti(DefaultExtractors);

  const yt = player.extractors.get('com.retrouser955.discord-player.discord-player-youtubei');
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
