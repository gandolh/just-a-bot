import { pendingDuelBetween } from "./duel.ts";
import { openTradeBetween } from "./trade.ts";
import type { World } from "./world.ts";

/**
 * Limits on duel and trade proposals from the Nearby screen. Each one is a
 * public post (a duel pings the defender) and a stored record, so a member
 * pressing Duel over and over could flood the channel and grow the world file.
 */

/** How long a member waits between proposals, of either kind. */
export const PROPOSAL_COOLDOWN_MS = 15_000;

const lastProposalAt = new Map<string, number>();

export type ProposalSlot = { ok: true; release: () => void } | { ok: false; waitSeconds: number };

/**
 * Take a member's proposal slot (`key` is guild and user), or say how long to
 * wait. Synchronous, so two quick presses cannot both pass. `release` gives the
 * slot back when the proposal is refused before anything is posted.
 */
export function claimProposalSlot(key: string, now = Date.now()): ProposalSlot {
  const last = lastProposalAt.get(key);
  if (last !== undefined && now - last < PROPOSAL_COOLDOWN_MS) {
    return { ok: false, waitSeconds: Math.ceil((last + PROPOSAL_COOLDOWN_MS - now) / 1000) };
  }
  lastProposalAt.set(key, now);
  return {
    ok: true,
    release: () => {
      if (lastProposalAt.get(key) === now) lastProposalAt.delete(key);
    },
  };
}

/** Why this pair may not have another proposal of this kind yet, or null. */
export function proposalConflict(world: World, kind: "duel" | "trade", fromId: string, toId: string): string | null {
  if (kind === "duel" && pendingDuelBetween(world, fromId, toId)) {
    return "⚔️ A duel between you two is already waiting for an answer.";
  }
  if (kind === "trade" && openTradeBetween(world, fromId, toId)) {
    return "🤝 You two already have a trade open. Finish or cancel it first.";
  }
  return null;
}
