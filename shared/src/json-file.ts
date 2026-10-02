import { mkdir, open, rename } from 'node:fs/promises';
import { dirname } from 'node:path';

/**
 * Crash-safe JSON persistence, shared by every store in the repo.
 *
 * State is plain JSON on disk (see corpus/wiki/decisions.md), and the write
 * chain is the only thing standing between it and lost updates, so it has to
 * hold up:
 *
 * - **Atomic.** The snapshot goes to `<file>.<pid>.tmp` in the same directory,
 *   is fsynced, then `rename`d over the target. The pid keeps two processes
 *   that briefly overlap (a restart, a deploy) from renaming each other's temp
 *   file away. A process killed mid-write (pm2's
 *   SIGKILL, OOM, a crash) leaves the old file or the new one, never a
 *   truncated one that makes every later load throw.
 * - **A chain that recovers.** Writes to one path run strictly in order, each
 *   after the previous one *settles*. A rejected write (ENOSPC, EACCES on a
 *   bind mount) rejects for its own caller only; the next write still runs.
 *   `then(write)` on a rejected chain used to skip every write after it.
 * - **Drainable.** `flushPendingWrites()` waits for everything in flight, so
 *   shutdown can finish its writes before exiting.
 *
 * The caller passes an already-serialized string, taken synchronously at the
 * moment of the change, so a later mutation of the cached object cannot leak
 * into an earlier queued write.
 */
const chains = new Map<string, Promise<void>>();

export function writeJsonFile(file: string, json: string): Promise<void> {
  const previous = chains.get(file) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(() => writeAtomically(file, json));
  chains.set(file, next);
  const settle = () => {
    if (chains.get(file) === next) chains.delete(file);
  };
  next.then(settle, settle);
  return next;
}

async function writeAtomically(file: string, json: string): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  const handle = await open(tmp, 'w');
  try {
    await handle.writeFile(json, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(tmp, file);
}

/** Resolves once every write queued so far, and any queued while waiting, has
 * settled. Never rejects: a failed write already rejected for its caller. */
export async function flushPendingWrites(): Promise<void> {
  while (chains.size > 0) {
    await Promise.allSettled([...chains.values()]);
  }
}
