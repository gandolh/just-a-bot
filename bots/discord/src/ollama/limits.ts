/**
 * How often a member may use `/ask`: one question in flight, and a wait
 * between questions. No env here, so the rules are tested on their own.
 */

/** Time between one member's questions, counted from when the last one was asked. */
export const ASK_COOLDOWN_MS = 30_000;

export type AskSlot =
  | { ok: true; done: () => void }
  | { ok: false; reason: 'busy' }
  | { ok: false; reason: 'cooldown'; waitSeconds: number };

/**
 * One question in flight per member, and a cooldown between questions. A slot
 * is taken synchronously, before the reply is deferred, so a burst of commands
 * from one member gets one through. `done` frees the in-flight mark; the
 * cooldown runs from the claim whatever the answer was, since a slow or failed
 * request costs the key as much as a good one.
 */
export class AskLimiter {
  private readonly inFlight = new Set<string>();
  private readonly lastAskedAt = new Map<string, number>();

  constructor(
    private readonly cooldownMs = ASK_COOLDOWN_MS,
    private readonly now: () => number = Date.now,
  ) {}

  claim(memberKey: string): AskSlot {
    if (this.inFlight.has(memberKey)) return { ok: false, reason: 'busy' };
    const last = this.lastAskedAt.get(memberKey);
    const at = this.now();
    if (last !== undefined && at - last < this.cooldownMs) {
      return { ok: false, reason: 'cooldown', waitSeconds: Math.ceil((last + this.cooldownMs - at) / 1000) };
    }
    this.inFlight.add(memberKey);
    this.lastAskedAt.set(memberKey, at);
    return { ok: true, done: () => void this.inFlight.delete(memberKey) };
  }
}
