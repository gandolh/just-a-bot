import type { RepliableInteraction } from 'discord.js';
import { logger } from '@bots/shared';
import { TICKS_PER_SECOND, World, flushWorld } from './world.ts';
import { joinClock, leaveClock } from './engine.ts';
import {
  CtlDir,
  buildControllerEmbed,
  buildControllerRows,
  ctlMove,
  hasAdjacentMob,
} from './controller.ts';

const log = logger.scoped('rpg-autowalk');

// Move cadence per speed: a normal move is ~1s (20 ticks); 2x halves it.
const STEP_TICKS: Record<1 | 2, number> = { 1: TICKS_PER_SECOND, 2: TICKS_PER_SECOND / 2 };
// Re-render an active controller at most this often (~1s) even when idle, so
// the world visibly lives around the player.
const RENDER_TICKS = TICKS_PER_SECOND;

interface Session {
  interaction: RepliableInteraction;
  guildId: string;
  userId: string;
  dir: CtlDir | null;      // null = standing still
  speed: 1 | 2;
  lastStepTick: number;
  lastRenderTick: number;
  rendering: boolean;      // guard against overlapping edits
}

const sessions = new Map<string, Session>();

export function sessionSpeed(userId: string): 1 | 2 {
  return sessions.get(userId)?.speed ?? 1;
}
export function isWalking(userId: string): boolean {
  return (sessions.get(userId)?.dir ?? null) !== null;
}
export function hasSession(userId: string): boolean {
  return sessions.has(userId);
}

// Open or refresh a controller session for a player: registers them with the
// guild clock so the world ticks while they're present.
export function openSession(
  interaction: RepliableInteraction,
  guildId: string,
  userId: string,
  speed?: 1 | 2,
): void {
  const existing = sessions.get(userId);
  const session: Session = {
    interaction,
    guildId,
    userId,
    dir: existing?.dir ?? null,
    speed: speed ?? existing?.speed ?? 1,
    lastStepTick: existing?.lastStepTick ?? 0,
    lastRenderTick: existing?.lastRenderTick ?? 0,
    rendering: false,
  };
  sessions.set(userId, session);
  joinClock(guildId, { userId, onTick: (w, t) => onTick(session, w, t) });
}

// Close a session (player exited / controller dismissed): stops the clock for
// them, freezing the world if they were the last one.
export function closeSession(guildId: string, userId: string): void {
  sessions.delete(userId);
  leaveClock(guildId, userId);
}

export function setWalk(userId: string, dir: CtlDir | null): void {
  const s = sessions.get(userId);
  if (s) s.dir = dir;
}
export function setSpeed(userId: string, speed: 1 | 2): void {
  const s = sessions.get(userId);
  if (s) s.speed = speed;
}

// Called once per simulation tick by the engine for this participant.
async function onTick(session: Session, world: World, tick: number): Promise<void> {
  if (sessions.get(session.userId) !== session) return; // superseded

  const char = world.chars[session.userId];
  if (!char) { closeSession(session.guildId, session.userId); return; }

  let moved = false;
  let stopped = false;

  // Advance a walk on cadence.
  if (session.dir && char.hp > 0 && tick - session.lastStepTick >= STEP_TICKS[session.speed]) {
    session.lastStepTick = tick;
    // Stop before walking into a fight.
    if (hasAdjacentMob(world, char)) {
      session.dir = null;
      stopped = true;
    } else {
      const res = ctlMove(world, char, session.dir);
      if (res.ok) {
        moved = true;
        if (hasAdjacentMob(world, char)) { session.dir = null; stopped = true; }
      } else {
        session.dir = null; // blocked by wall/entity
        stopped = true;
      }
    }
  }

  // Render on movement, on stop, or on the idle ~1s cadence.
  const due = tick - session.lastRenderTick >= RENDER_TICKS;
  if (moved || stopped || due) {
    await render(session, world, tick, stopped ? '⏸️ Auto-walk stopped.' : undefined);
  }
}

async function render(
  session: Session,
  world: World,
  tick: number,
  banner?: string,
): Promise<void> {
  if (session.rendering) return; // skip if a previous edit is still in flight
  session.rendering = true;
  session.lastRenderTick = tick;
  const char = world.chars[session.userId];
  try {
    if (!char) return;
    const embed = buildControllerEmbed(world, char, banner, undefined, 'world');
    const rows = buildControllerRows('world', char, world, {
      walking: session.dir !== null,
      speed: session.speed,
    });
    await session.interaction.editReply({ embeds: [embed], components: rows });
  } catch (err) {
    // Token expired / message gone — end the session quietly.
    log.error(`autowalk render failed for ${session.userId}`, err);
    closeSession(session.guildId, session.userId);
    void flushWorld(session.guildId);
  } finally {
    session.rendering = false;
  }
}
