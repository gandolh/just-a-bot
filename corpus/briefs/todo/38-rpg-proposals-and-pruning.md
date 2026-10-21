# Task 38: RPG: one pending proposal per pair, and prune finished duels and trades

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
