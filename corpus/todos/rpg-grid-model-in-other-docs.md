---
title: Two manual pages still describe the RPG's old grid and tick
created: 2026-11-04
status: open
tags: [rpg, docs]
---

# Two manual pages still describe the RPG's old grid and tick

Found while rewriting the RPG manual (brief 12, 2026-11-04), outside that
brief's one file. The RPG moved from a tile grid with roaming mobs to six
named places with private, turn-based fights, but:

- `docs/discord/architecture.md`'s source tree says `rpg/` holds "world
  model, combat, mob spawn/tick, map renderer". There is no mob tick or map
  renderer; `rpg/` is the world model, the places, the controller screens,
  combat, duels, trades, the shop, bounties and the crier.
- `docs/discord/reminders/README.md` contrasts reminders with the RPG's
  "lazy tick" twice ("mobs only move when a player acts"). Mobs don't move at
  all now; the RPG's only timer is the crier.

A wording fix in each page, against [the RPG manual](../../docs/discord/rpg/README.md).
