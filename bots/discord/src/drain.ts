import { logger } from "@bots/shared";

const log = logger.scoped("shutdown");

/**
 * Run every store's flush to the end, whatever the others do, and log each
 * failure. Shutdown uses it: an RPG world that cannot be written (EACCES,
 * ENOSPC, EIO on the bind mount) must not abandon the wallet, quote, Mafia,
 * reminder and birthday writes queued behind it. Resolves with the names of
 * the flushes that failed.
 */
export async function drainStores(flushes: Record<string, () => Promise<void>>): Promise<string[]> {
  const names = Object.keys(flushes);
  const results = await Promise.allSettled(names.map((name) => flushes[name]()));
  const failed: string[] = [];
  results.forEach((result, i) => {
    if (result.status === "rejected") {
      failed.push(names[i]);
      log.error(`Flushing ${names[i]} on shutdown failed`, result.reason);
    }
  });
  return failed;
}
