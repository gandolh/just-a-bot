# Task 16: The RPG shop sells a spare copy of an item you wear

Promoted on 2026-11-05 from the todo `rpg-sell-spare-of-worn-item` (found
while rewriting the RPG manual, brief 12, 2026-11-04).

## Context

Equipping an item takes it out of the bag, so a worn item is never in
`inventory`. Yet the Town screen's sell menu (`buildRows` in
`bots/discord/src/rpg/locationui.ts`) drops every bag slug equal to the worn
weapon or armor, and `sellItem()` in `bots/discord/src/rpg/shop.ts` refuses
the same slugs with "is equipped — unequip it first". A player wearing a
Rusty Dagger with a second one in the bag can't sell the spare. The trade
menu has no such filter, so the spare can still be traded.

Both checks look like leftovers from before equipping moved items out of the
bag. Confirm that against the equip code (`locationui.ts`'s equip and
unequip, and whatever moves an item between bag and slot) before removing
them.

## Files you OWN

- `bots/discord/src/rpg/shop.ts`, `bots/discord/src/rpg/locationui.ts`
- A test beside them (`*.test.ts`, `node:test`, no Discord)
- `docs/discord/rpg/README.md` if it says anything about selling worn items
- `corpus/log.md`, `corpus/wiki/status.md`

## Files you must NOT touch

- `bots/discord/.env` (production's values). Don't run the bot or register
  commands.

## What to do

1. Check that equipping removes the item from `inventory` in every path
   (equip from the bag, a duel or trade reward, starting gear).
2. Drop the worn-slug filter from the sell menu and the equipped refusal
   from `sellItem()`, if step 1 holds. If some path leaves a worn item in the
   bag, keep a guard that refuses only when the bag holds no copy beyond the
   worn one, and say so in the outcome.
3. A test: a player wearing a Rusty Dagger with a second one in the bag sees
   it in the sell menu and sells it; the worn one stays worn.

## Acceptance

- The spare sells; the worn item is untouched.
- `npm run typecheck` and the bot's `npm test` pass.
