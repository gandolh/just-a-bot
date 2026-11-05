# Task 17: Two manual pages drop the RPG's old grid and tick

Promoted on 2026-11-05 from the todo `rpg-grid-model-in-other-docs` (found
while rewriting the RPG manual, brief 12, 2026-11-04). Docs only.

## Context

The RPG moved from a tile grid with roaming mobs to six named places with
private, turn-based fights, but two pages outside the RPG manual still
describe the old model:

- `docs/discord/architecture.md`'s source tree says `rpg/` holds "world
  model, combat, mob spawn/tick, map renderer". There is no mob tick or map
  renderer; `rpg/` is the world model, the places, the controller screens,
  combat, duels, trades, the shop, bounties and the crier.
- `docs/discord/reminders/README.md` contrasts reminders with the RPG's
  "lazy tick" twice ("mobs only move when a player acts"). Mobs don't move
  at all now; the RPG's only timer is the crier.

## Files you OWN

- `docs/discord/architecture.md`, `docs/discord/reminders/README.md`
- `corpus/log.md`, `corpus/wiki/status.md`

## What to do

Fix the wording in each page against the code (`bots/discord/src/rpg/`)
and [the RPG manual](../../../docs/discord/rpg/README.md). Grep `docs/` for
other mentions of a grid, tile, map renderer or mob tick and fix any you
find in the same way.

## Acceptance

No page under `docs/` describes the RPG's tile grid, map renderer or mob
tick; `npm run corpus:lint` passes.
