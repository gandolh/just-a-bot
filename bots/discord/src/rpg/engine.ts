import { logger } from '@bots/shared';
import {
  MS_PER_TICK,
  TICKS_PER_SECOND,
  World,
  loadWorld,
  markDirty,
} from './world.ts';
import { tickWorld } from './tick.ts';

const log = logger.scoped('rpg-engine');

// Persist a running world roughly this often (in ticks). In-memory state is
// always authoritative; this just snapshots to disk periodically.
const SNAPSHOT_EVERY_TICKS = TICKS_PER_SECOND * 5; // ~5s

// A participant whose presence keeps a guild's clock running. The engine calls
// `onTick` once per simulation tick (so it can advance walks, decide when to
// re-render, etc.). The participant is responsible for its own render cadence.
export interface Participant {
  userId: string;
  onTick: (world: World, tick: number) => void | Promise<void>;
}

interface GuildClock {
  guildId: string;
  participants: Map<string, Participant>;
  interval: NodeJS.Timeout;
  ticksSinceSnapshot: number;
}

const clocks = new Map<string, GuildClock>();

// Register (or refresh) a participant for a guild, starting the clock if it was
// frozen. Re-registering the same userId replaces the previous participant.
export function joinClock(guildId: string, participant: Participant): void {
  let clock = clocks.get(guildId);
  if (!clock) {
    const interval = setInterval(() => void runTick(guildId), MS_PER_TICK);
    if (typeof interval.unref === 'function') interval.unref();
    clock = { guildId, participants: new Map(), interval, ticksSinceSnapshot: 0 };
    clocks.set(guildId, clock);
    log.info(`clock started for guild ${guildId}`);
  }
  clock.participants.set(participant.userId, participant);
}

// Remove a participant; hard-freeze the guild's world when the last one leaves.
export function leaveClock(guildId: string, userId: string): void {
  const clock = clocks.get(guildId);
  if (!clock) return;
  clock.participants.delete(userId);
  if (clock.participants.size === 0) {
    clearInterval(clock.interval);
    clocks.delete(guildId);
    markDirty(guildId); // flush the frozen state to disk
    log.info(`clock frozen for guild ${guildId}`);
  }
}

export function isParticipant(guildId: string, userId: string): boolean {
  return clocks.get(guildId)?.participants.has(userId) ?? false;
}

async function runTick(guildId: string): Promise<void> {
  const clock = clocks.get(guildId);
  if (!clock) return;
  const world = await loadWorld(guildId);
  if (!world) return;

  tickWorld(world);

  // Let each participant advance its own state (walks) and render as needed.
  for (const p of clock.participants.values()) {
    try {
      await p.onTick(world, world.tick);
    } catch (err) {
      log.error(`participant ${p.userId} onTick failed`, err);
    }
  }

  // Periodic snapshot to disk.
  if (++clock.ticksSinceSnapshot >= SNAPSHOT_EVERY_TICKS) {
    clock.ticksSinceSnapshot = 0;
    markDirty(guildId);
  }
}

// Stop every clock — used on shutdown.
export function stopAllClocks(): void {
  for (const clock of clocks.values()) clearInterval(clock.interval);
  clocks.clear();
}

// Self-manage shutdown: stop clocks before the process exits. World persistence
// is flushed by world.ts's own shutdown hook.
const onExit = () => stopAllClocks();
process.once('SIGINT', onExit);
process.once('SIGTERM', onExit);
process.once('beforeExit', onExit);
