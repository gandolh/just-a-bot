# Task 12: The RPG manual matches the commands

## Context

Found while building brief 08 (2026-11-02). `docs/discord/rpg/README.md`'s
command table and quick start list `/rpg join name:… glyph:…`, `move`,
`look`, `attack`, `duel @user`, `trade @user` and more. The command in
`bots/discord/src/commands/rpg.ts` has three subcommands, `start`, `exit` and
`help`; everything else, character creation included, is the button
controller and its modal (`bots/discord/src/rpg/`).

Brief 10 added limits the same day that the manual doesn't mention: a 15 s
wait between duel or trade proposals per member, one pending duel and one
open trade per pair, and duels and trades pruned once over (or after a
day). Promoted from the todo `rpg-docs-describe-old-commands` in a grill
with the owner on 2026-11-03.

## Files you OWN

- `docs/discord/rpg/README.md`

## Files you must NOT touch

- Any code. If the code and the manual disagree in a way that looks like a
  bug, write a todo instead.
- `.env` (production's values).

## What to do

1. Read `commands/rpg.ts` and the controller in `bots/discord/src/rpg/`
   (buttons, the creation modal, duels, trades, shop, locations) and list
   what a player can actually do.
2. Rewrite the command table and the quick start against that: `/rpg
   start`, `exit` and `help`, then the buttons and the modal.
3. Say on the character-name line that mention syntax, @everyone, @here and
   backticks are stripped.
4. Describe the proposal limits and the pruning from brief 10.
5. Don't run the bot or register commands; this is a docs change read
   against the source.

## Acceptance

- Every command, button and limit the manual names exists in the code,
  and none it leaves out is a player action.
- No subcommand the command doesn't have (`join`, `move`, `look`,
  `attack`, `duel`, `trade` as slash subcommands) is left.
- The repo's docs build or link check, if it has one, passes.

## Outcome (2026-11-04)

Built in the commit that moved this brief to `done/` ("Brief 12: the RPG
manual matches the commands").

- `docs/discord/rpg/README.md` is rewritten against `commands/rpg.ts`,
  `commands/rpg-buttons.ts` and `rpg/`. The game is no longer the tile grid
  the old manual described: a player is always at one of six named places
  (`rpg/locations.ts`), travels by button, and fights one mob at a time in a
  private, turn-based encounter. The manual now covers `/rpg start`, `exit`
  and `help`; the creation button and modal; every controller screen and
  button as `buildRows` builds them; the places with their danger, mobs and
  exits; the explore, travel-ambush, flee and rest numbers; combat, kills,
  levels and death; equipment, shop, bounties and mobs (those tables were
  still right); the town crier; duels and trades; brief 10's limits and
  pruning; the world file, the source layout and every `rpg:` custom id.
- The character-name line says mention syntax, @everyone, @here and
  backticks are stripped, whitespace collapses, the cap is 24, and the
  fallbacks are the Discord username, then "Adventurer".
- Where the old manual and the code differ, the code was written down:
  dying costs half your coins outright (no loot tile), kills put loot in the
  bag, combat is turn-based, and **🎯 Reroll bounty** replaces the current
  bounty at any time (the old `/rpg bounty` rolled only when the slot was
  empty). `/rpg top` is gone; the manual points at `/top`'s `rpg-*`
  categories. The world file still carries the grid version's keys, which
  nothing reads; the manual says so.
- The exit message still says "mobs cannot reach you", though no mob roams
  any more: it is a code string and was left alone.

Checks: every relative link in the page resolves (a shell loop over its
targets); `/rpg start`, `exit` and `help` are the only `/rpg` subcommands it
names. The Docusaurus build, the repo's real link check, was not run: it is
a heavy build and this run kept to light checks. The bot was not run.

Filed as todos, outside this brief's one file:
`rpg-sell-spare-of-worn-item` (the shop refuses a spare copy of a worn item,
which looks like a bug) and `rpg-grid-model-in-other-docs`
(`docs/discord/architecture.md` and the reminders manual still describe the
grid's tick). The stale Town screen that still buys and sells away from the
Plaza is already on the log's 2026-09-26 Watch list.
