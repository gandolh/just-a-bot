/**
 * The empty-channel rule (brief 26). When nobody but bots is left in the
 * bot's voice channel, pause, and leave if still alone ten minutes later. If
 * someone comes back first, cancel the leave and stay paused: they press play.
 *
 * The decision lives in the bot because the voice events arrive here, but both
 * actions go through atrium (`control` with `pause` and `leave`), so a Player
 * keeps one writer. No discord.js in this file, so the timer can be tested
 * with a fake clock.
 */

export const LEAVE_AFTER_MS = 10 * 60_000;

export interface AloneActions {
  pause(): void;
  leave(): void;
}

export interface Timers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

const realTimers: Timers = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => clearTimeout(handle as NodeJS.Timeout),
};

export class AloneWatch {
  private alone = false;
  private leaveTimer: unknown = null;

  constructor(
    private readonly actions: AloneActions,
    private readonly timers: Timers = realTimers,
    private readonly leaveAfterMs = LEAVE_AFTER_MS,
  ) {}

  /** The number of people (not bots) in the bot's channel changed, or the bot is in no channel (`null`). */
  update(humans: number | null): void {
    if (humans === null) {
      this.reset();
      return;
    }
    if (humans === 0 && !this.alone) {
      this.alone = true;
      this.actions.pause();
      this.leaveTimer = this.timers.setTimeout(() => {
        this.leaveTimer = null;
        this.alone = false;
        this.actions.leave();
      }, this.leaveAfterMs);
    } else if (humans > 0 && this.alone) {
      this.reset();
    }
  }

  /** Forget the countdown: someone came back, the bot left, or it is shutting down. */
  reset(): void {
    if (this.leaveTimer !== null) this.timers.clearTimeout(this.leaveTimer);
    this.leaveTimer = null;
    this.alone = false;
  }
}
