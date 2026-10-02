# Task 13 — RPG: block location actions while a fight is in progress

## Context

Source: the 2026-09-26 improvements audit, recorded in [log.md](../../log.md).
Rank 10 of 16.

`handleControllerButton` in `bots/discord/src/commands/rpg-buttons.ts` runs its
action switch (`:200-300`) inside `updateWorld`. When `char.encounter` is set,
line 198 only changes which screen renders. Every case in the switch still runs.

The combat screen offers only Attack, Flee and Potion
(`rpg/locationui.ts:240-246`), but older controller messages stay clickable.
Each `/rpg start` sends a new ephemeral controller, and the footer
(`locationui.ts:147`) tells players to run `/rpg start` again when buttons stop
responding. So players commonly have two controllers open.

Failure scenario: a player clicks Explore on controller B, and a Troll ambush
starts. They then use the older controller A:

- **Rest** runs `doRest` (`locationui.ts:139-145`), which heals 30% of max HP
  with no counter-attack. The fight continues.
- **Explore** calls `startEncounter` again. That swaps a losing fight for a fresh
  mob and skips the parting hit Flee would take.
- **Travel** moves the character mid-fight.
- **Bag, buy, sell and equip** all run mid-fight as well.

## Files you OWN

- `bots/discord/src/commands/rpg-buttons.ts`, `handleControllerButton` only

## Files you must NOT touch

- `rpg/*.ts` game logic.
- The duel and trade handlers in the same file. Brief 08 fixes trades in
  `rpg/trade.ts`, not here.

## What to do

1. Before the `switch`, add a guard. If `char.encounter` is set and the action
   isn't `fight`, `flee` or `combatpotion`:
   - set `screen = 'combat'`
   - set `banner = "You're in a fight! Attack, flee, or drink a potion."`
   - return from the mutate callback without running the switch

   This also covers `screen` clicks. Today the `screen` case overrides the combat
   screen that line 198 picks, so the guard has to run first.

## Acceptance

- `npm run typecheck` clean.
- On the dev application, open two controllers with `/rpg start` and start a
  fight on one of them (explore somewhere with mobs until you're ambushed). On the
  other controller, Rest, Explore, Travel and Bag each show the combat screen and
  the banner. HP doesn't change and the mob stays the same.
- Attack, Flee and Potion still work.
- Once the fight ends, location actions work again.

## Outcome (2026-10-02)

`handleControllerButton` now guards before the action switch. With
`char.encounter` set, any action other than `fight`, `flee` or `combatpotion`
(`screen` included) sets the combat screen and the banner "You're in a fight!
Attack, flee, or drink a potion." and returns from the mutate callback. `rpg/*.ts`
and the duel and trade handlers are untouched.

Verified: `npm run typecheck` is clean. **Not verified live:** the
two-controller run on the dev app (no dev token here).
