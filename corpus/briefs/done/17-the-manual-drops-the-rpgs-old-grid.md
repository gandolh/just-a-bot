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

## Outcome (2026-11-05)

Built in the commit that moved this brief to `done/` ("Brief 17: two manual
pages drop the RPG's old grid and tick"). Docs only.

- `docs/discord/architecture.md`: `rpg/` is "world model and places,
  controller screens, combat, duels, trades, shop, bounties, town crier".
- `docs/discord/reminders/README.md`: the "lazy tick" contrast is now
  heartbeat vs. player-driven. The RPG needs no clock to run its world
  (places are fixed, mobs don't move, a fight advances on its player's
  press) and its one timer is the town crier. The page also said the
  reminder loop was "the only background timer in the bot" and kept
  "exactly one timer in the process"; neither was true (`index.ts` starts
  the crier's 20-second interval beside it), so both lines say what the
  loop is without claiming to be alone.
- A grep of `docs/` for grid, tile, map renderer, mob tick, spawn and roam
  found nothing else about the RPG's old model. The RPG manual's note that
  the save file still carries keys from the grid version (`grid`, `tick`,
  `pos`, …) stays: it describes the file, and `world.ts` still backfills
  `world.tick` and has a grid-era `entityAt(row, col)`. Those code leftovers
  are outside a docs brief.
