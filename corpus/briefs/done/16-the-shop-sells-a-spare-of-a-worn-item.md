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

## Outcome (2026-11-05)

Built in the commit that moved this brief to `done/` ("Brief 16: the shop
sells a spare copy of a worn item").

- **Step 1 held, so no fallback guard.** `doEquip` in `locationui.ts`
  splices the item out of `inventory` before it fills the slot, and
  `doUnequip` pushes it back. Nothing else writes `equipment`: a new
  character starts with an empty bag and empty slots, `loadWorld` only
  backfills empty slots, duels award XP only, and combat drops, the
  encounter potion and trades all touch `inventory` alone.
- **The checks were never leftovers.** `git log -S` shows the equipped
  refusal in `sellItem()` and the splice on equip arrived in the same commit
  (`63cba90`, 2026-05-22): the check was redundant from the start, not left
  behind by a later change.
- The Town sell menu now lists every distinct slug in the bag, and
  `sellItem()` no longer refuses worn slugs. A worn item alone still can't be
  sold: it isn't in the bag, so `sellItem()` answers "You don't have a … to
  sell".
- `rpg/shop.test.ts`: a player wearing a Rusty Dagger with a second in the
  bag sees it under "Sell an item…", sells it for its price, and still wears
  the first; with no spare, the menu is empty and the sale is refused.
  The first test fails against the old code.
- The RPG manual's Town line says a spare copy of a worn item sells.
- Typecheck clean. The bot's `npm test` runs 114/114 with a dummy
  `WICKET_URL` in the shell. Without it, `help.test.ts` and
  `jukebox.test.ts` fail at import, because `WICKET_URL` in the local
  `.env` (production's, changed after brief 14 was committed) isn't a
  valid URL. The value is 40 characters with no `http(s)://` in front.
  With that `.env` the bot would stop at boot, so the owner must fix it
  before deploying.
- Not run in Discord. The check: wear a Rusty Dagger with a second in the
  bag, open 🏪 Town at the Plaza, sell the spare from "Sell an item…", and
  🎒 Bag still shows the first one worn.
