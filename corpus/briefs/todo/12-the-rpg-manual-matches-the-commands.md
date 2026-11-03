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
