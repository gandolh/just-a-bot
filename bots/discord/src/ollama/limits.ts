/**
 * What `/ask` lets a member spend of the owner's Ollama key: which models,
 * how often, and how much of the channel an answer may take. No env here, so
 * the rules are tested on their own.
 */

/** Discord allows 25 choices on an option. */
export const MAX_MODEL_CHOICES = 25;
/** A choice's name and value are at most 100 characters. */
const MAX_MODEL_NAME = 100;
/** Time between one member's questions, counted from when the last one was asked. */
export const ASK_COOLDOWN_MS = 30_000;

/**
 * The models `/ask` offers: the default first, then `OLLAMA_MODELS`
 * (comma-separated), without blanks, repeats or names Discord would refuse.
 */
export function allowedModels(defaultModel: string, list: string | undefined): string[] {
  const names = [defaultModel, ...(list ?? '').split(',')].map((name) => name.trim());
  const usable = names.filter((name) => name.length > 0 && name.length <= MAX_MODEL_NAME);
  return [...new Set(usable)].slice(0, MAX_MODEL_CHOICES);
}

/** The model to ask: the member's pick if it is offered, the default if they picked none, else null. */
export function pickModel(requested: string | null, offered: readonly string[], defaultModel: string): string | null {
  const model = requested ?? defaultModel;
  return offered.includes(model) ? model : null;
}

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
