import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdir, rename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough, Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { logger } from '@bots/shared';

const log = logger.scoped('jukebox');

/**
 * The per-guild disk buffer (brief 26). Each Track is converted once, MP3 to
 * Ogg Opus, so the voice library can send it without FFmpeg or an Opus
 * encoder at playback. The current Track and the next two are kept on disk,
 * never in RAM, and never more than three files per guild. A Track not yet
 * buffered plays from a live pipe: the download goes through ffmpeg straight
 * to the player, so a cold start is heard as the bytes arrive.
 *
 * The session cookie never reaches ffmpeg's command line: Node downloads the
 * file and feeds ffmpeg's stdin.
 */

export const BUFFER_ROOT = join(tmpdir(), 'jukebox');
/** The current Track plus this many of `upcoming`. */
export const PREFETCH = 2;

const OGG_OPUS = ['-vn', '-c:a', 'libopus', '-b:a', '96k', '-ar', '48000', '-ac', '2', '-f', 'ogg'];

export interface BufferPlan {
  /** Buffered and still wanted. */
  keep: string[];
  /** Wanted and neither buffered nor on its way. */
  fetch: string[];
  /** On its way, no longer wanted. */
  cancel: string[];
  /** Buffered, no longer wanted. */
  delete: string[];
}

/**
 * Which files to keep, fetch, cancel or delete for a given current Track and
 * `upcoming`. The current Track is kept if it is buffered but never fetched:
 * when it is not, it is already playing from the live pipe, and a second
 * download would only compete with it.
 */
export function planBuffer(input: {
  current: string | null;
  upcoming: readonly string[];
  ready: readonly string[];
  fetching: readonly string[];
}): BufferPlan {
  const next = [...new Set(input.upcoming)].filter((id) => id !== input.current).slice(0, PREFETCH);
  const wanted = new Set(input.current ? [input.current, ...next] : next);
  return {
    keep: input.ready.filter((id) => wanted.has(id)),
    fetch: next.filter((id) => !input.ready.includes(id) && !input.fetching.includes(id)),
    cancel: input.fetching.filter((id) => !wanted.has(id)),
    delete: input.ready.filter((id) => !wanted.has(id)),
  };
}

/** Where a Track's audio comes from: atrium's file route, as the Bot account. */
export type FetchTrack = (trackId: string, signal: AbortSignal) => Promise<Readable>;

/** A Track to play: the stream, and whether it failed (so the end counts as an `error`). */
export interface OpenTrack {
  stream: Readable;
  live: boolean;
  failed: () => boolean;
}

/** Delete every guild's buffer. At boot, so a restart starts empty. */
export async function wipeBuffers(): Promise<void> {
  await rm(BUFFER_ROOT, { recursive: true, force: true });
}

export class TrackBuffer {
  private readonly ready = new Set<string>();
  private readonly fetching = new Map<string, AbortController>();
  private readonly dir: string;

  constructor(
    guildId: string,
    private readonly fetchTrack: FetchTrack,
  ) {
    this.dir = join(BUFFER_ROOT, guildId);
  }

  private file(trackId: string): string {
    return join(this.dir, `${trackId}.ogg`);
  }

  /** Bring the directory in line with what plays now and next. */
  update(current: string | null, upcoming: readonly string[]): void {
    const plan = planBuffer({ current, upcoming, ready: [...this.ready], fetching: [...this.fetching.keys()] });
    for (const id of plan.cancel) {
      this.fetching.get(id)?.abort();
      this.fetching.delete(id);
    }
    for (const id of plan.delete) {
      this.ready.delete(id);
      void rm(this.file(id), { force: true });
    }
    for (const id of plan.fetch) void this.prefetch(id);
  }

  /** The buffered file if it is ready, otherwise a live pipe through ffmpeg. */
  async open(trackId: string): Promise<OpenTrack> {
    if (this.ready.has(trackId)) {
      return { stream: createReadStream(this.file(trackId)), live: false, failed: () => false };
    }
    const abort = new AbortController();
    const input = await this.fetchTrack(trackId, abort.signal);
    const ffmpeg = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', ...OGG_OPUS, 'pipe:1'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let failed = false;
    let stderr = '';
    ffmpeg.stderr.on('data', (chunk) => (stderr = (stderr + chunk).slice(-500)));
    ffmpeg.on('error', (err) => {
      failed = true;
      log.warn(`ffmpeg could not start for ${trackId}: ${err.message}`);
    });
    ffmpeg.on('close', (code, signal) => {
      if (code !== 0 && signal === null) {
        failed = true;
        log.warn(`ffmpeg failed on ${trackId} (${code}): ${stderr.trim()}`);
      }
    });
    pipeline(input, ffmpeg.stdin).catch((err: Error) => {
      // The player stopping early closes ffmpeg's stdin; that is not a failure.
      if (!abort.signal.aborted && (err as NodeJS.ErrnoException).code !== 'EPIPE') {
        failed = true;
        log.warn(`downloading ${trackId} failed: ${err.message}`);
      }
    });
    // When the player is done with the stream (ended, stopped or replaced),
    // stop the download and ffmpeg with it.
    const out = new PassThrough();
    ffmpeg.stdout.pipe(out);
    out.on('close', () => {
      abort.abort();
      ffmpeg.kill('SIGKILL');
    });
    return { stream: out, live: true, failed: () => failed };
  }

  /** Download and convert one Track to `<id>.ogg`, by way of `<id>.ogg.part`. */
  private async prefetch(trackId: string): Promise<void> {
    const abort = new AbortController();
    this.fetching.set(trackId, abort);
    const part = `${this.file(trackId)}.part`;
    try {
      await mkdir(this.dir, { recursive: true });
      const input = await this.fetchTrack(trackId, abort.signal);
      const ffmpeg = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', 'pipe:0', ...OGG_OPUS, part], {
        stdio: ['pipe', 'ignore', 'pipe'],
      });
      const onAbort = () => ffmpeg.kill('SIGKILL');
      abort.signal.addEventListener('abort', onAbort, { once: true });
      let stderr = '';
      ffmpeg.stderr.on('data', (chunk) => (stderr = (stderr + chunk).slice(-500)));
      const exited = new Promise<number | null>((resolve, reject) => {
        ffmpeg.on('error', reject);
        ffmpeg.on('close', resolve);
      });
      await Promise.all([pipeline(input, ffmpeg.stdin).catch(() => {}), exited]).then(([, code]) => {
        if (abort.signal.aborted) throw new Error('cancelled');
        if (code !== 0) throw new Error(`ffmpeg exited ${code}: ${stderr.trim()}`);
      });
      await rename(part, this.file(trackId));
      // Cancelled after ffmpeg finished? The plan no longer wants it.
      if (abort.signal.aborted) await rm(this.file(trackId), { force: true });
      else this.ready.add(trackId);
    } catch (err) {
      await rm(part, { force: true });
      if (!abort.signal.aborted) log.warn(`buffering ${trackId} failed: ${(err as Error).message}`);
    } finally {
      if (this.fetching.get(trackId) === abort) this.fetching.delete(trackId);
    }
  }

  /** Cancel every download and delete this guild's files. */
  async clear(): Promise<void> {
    for (const abort of this.fetching.values()) abort.abort();
    this.fetching.clear();
    this.ready.clear();
    await rm(this.dir, { recursive: true, force: true });
  }

  /** The files on disk right now, `.part` included. For the three-file check. */
  get size(): number {
    return this.ready.size + this.fetching.size;
  }
}
