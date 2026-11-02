# Task 10: RPG: one pending proposal per pair, and prune finished duels and trades

## Context

`commands/rpg-buttons.ts:353-402`: the Nearby screen's Duel and Trade buttons only check that both
characters exist and share a location. Every press posts a public proposal that pings the defender
and stores a record (`rpg/duel.ts:25` `world.duels[id] = duel`, `rpg/trade.ts:23`). Nothing deletes
duels or trades (grep finds only the creators and readers), a played duel keeps its whole swing log
(`duel.ts:92`), and the whole world file is re-serialised and fsynced on every urgent controller
press (`world.ts:257`). Only the crier queue is capped.

Improvement sweep of 2026-10-20 (security/abuse lens), vetted against the code; the ranked report is the owner's "Repo improvement sweep" doc.

## Files you OWN

- `bots/discord/src/rpg/duel.ts`, `rpg/trade.ts`, `rpg/world.ts`
- `bots/discord/src/commands/rpg-buttons.ts` (the guard)
- tests

## What to do

1. Refuse a new proposal while one between the same pair is pending, and add a short per-member cooldown.
2. Prune finished or expired duels and trades (older than a day) when a world loads and when a new one is created; drop a duel's log once it is resolved.

## Acceptance

- A test: a second proposal for a pending pair is refused.
- A world with 1,000 finished duels loads with none kept.

## Outcome (2026-11-02)

Built in `69681a1`.

- `rpg/proposals.ts`: `claimProposalSlot()` gives each member one proposal
  per 15 s (`PROPOSAL_COOLDOWN_MS`), in memory, taken before the first await
  in `handleSocialInitiation` and released when the proposal is refused
  before anything is posted (target gone, out of reach, pair conflict).
  `proposalConflict()` refuses a duel while `pendingDuelBetween()` finds a
  pending, unexpired duel between the pair either way round, and a trade
  while `openTradeBetween()` finds an open one. The refusal shows as the
  controller's banner; the cooldown as an ephemeral reply.
- Per kind, not across kinds: a pending duel does not block a trade between
  the same two. Only duels ping, and the cooldown covers both.
- `pruneDuelsAndTrades(world, now)` in `rpg/world.ts` runs in `loadWorld`
  and at the start of `startDuel` and `startTrade`. Finished duels and
  completed or cancelled trades go at once; anything else (pending or active
  duels, open trades) goes after a day (`SOCIAL_RECORD_TTL_MS`). The brief's
  "finished or expired … older than a day" was read that way: nothing reads a
  finished record again, while an expired pending duel is kept until the day
  is up so a late press on its buttons still says "expired" instead of "Duel
  not found". `Trade` gains `createdAt`; a trade saved without one gets the
  load time.
- `runDuel()` collects the swing log in a local array, returns it, and leaves
  `duel.log` empty.

Checks: typecheck clean; bot tests 93/93. New `rpg/proposals.test.ts`: a
second duel for a pending pair is refused both ways round, another pair and
a trade are not; an expired duel stops blocking; a second open trade is
refused; the cooldown and its release; a world with 1,000 finished duels
(each with a 30-line log) keeps none; closed trades go, open and legacy ones
stay a day, an expired duel stays a day; a resolved duel stores no log.
`trade.test.ts`'s world fixture gained `duels: {}`. The load path itself is
untested, since `loadWorld` reads the real data directory. The bot was not
run. The RPG manual is stale anyway; the limits were added to its todo.

**Owed by the owner** (optional, live): pressing Duel twice on the same
player gives the wait message, and again after 15 s the "already waiting"
banner while the first challenge is open.
