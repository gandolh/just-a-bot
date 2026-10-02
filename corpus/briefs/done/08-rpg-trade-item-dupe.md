# Task 08 — RPG: a trade can duplicate items

## Context

Source: the 2026-09-26 improvements audit, recorded in [log.md](../../log.md).
Rank 5 of 16.

`executeTrade` in `bots/discord/src/rpg/trade.ts:92-130` validates each offered
item with `inventory.includes(item)` (`:104-109`), which only checks that at least
one copy exists. The transfer loops (`:117-126`) push a copy to the counterparty
for every entry in the offer, but splice from the giver only when `indexOf` finds
one.

`toggleItem` (`:51-74`) lets a player offer as many copies as they own at offer
time. Nothing locks an offered item. Selling (`doSell(char, slug)`,
`rpg/locationui.ts:128`) and using or equipping items don't know about open trades.

Failure scenario:

1. A owns 2 Swords, opens a trade with B and offers both. A confirms.
2. A goes to the town screen and sells one Sword for coins.
3. B confirms and `executeTrade` runs. Validation passes because A still has one
   Sword. The first loop pass moves A's last Sword to B. The second finds nothing
   to splice and pushes another Sword to B anyway.
4. B ends up with 2 Swords. A lost 1 and kept the sale coins.

This works with any stackable item (potions), and two players can collude to
repeat it. RPG coins and items are earned, unlike the gambling wallet where
`/coins add` is free, so this breaks the one economy in the bot that has scarcity.

## Files you OWN

- `bots/discord/src/rpg/trade.ts`

## Files you must NOT touch

- `commands/rpg-buttons.ts` (the trade UI) and the shop and sell code. Checking
  counts at execute time is enough, so no item locking is needed.

## What to do

1. Replace the two `.includes` loops with a count check. For each side, build a
   `Map<item, offeredCount>` and compare it against how many copies that side's
   inventory holds. If any count falls short, fail with the existing reason text
   (`${name} no longer has ${item}.`).
2. In the transfer loops, push to the receiver only when the splice actually
   removed a copy. Step 1 already prevents the shortfall, but this way any future
   validation slip loses an item instead of duplicating one.
3. Leave coins alone. They are already checked at execute time (`:101-102`).

## Acceptance

- `npm run typecheck` clean.
- A tsx scratch script builds a minimal `World` with two characters and calls
  `startTrade` / `toggleItem` / `confirmSide` / `executeTrade` directly:
  - A owns two of an item and offers both. One copy is removed from A's
    inventory, then both sides confirm. `executeTrade` returns `ok: false` and
    both inventories are unchanged.
  - A owns two and trades two. Result is `ok`, A has 0 and B has 2.
  - For every successful trade in the script, each item's total count across A
    and B is the same before and after.
- If brief 19 has landed, put these in `rpg/trade.test.ts` instead of a scratch
  script.

## Outcome (2026-10-02)

`executeTrade` now counts. `missingItem` builds a `Map<item, offeredCount>` per
side and fails with the existing `${name} no longer has ${item}.` when an
inventory holds fewer copies than offered. `moveItems` gives the receiver a copy
only when the giver's splice removed one. Coins are untouched.

**Finding: the failure scenario is not reachable through the shipped UI.**
Offers are built by the trade select menu (`rpg-buttons.ts:815-842`), whose
options are `[...new Set(items)]`, so an offer holds at most one copy of each
item. The handler also checks ownership. `toggleItem` (the path the brief
describes) has no callers. Selling the one offered copy and then executing was
already refused by `includes`. So this is hardening of `executeTrade`'s own
contract, not a live exploit fix. It matters the day an offer can hold
duplicates, for example a quantity picker.

Verified with a tsx scratch script on `startTrade`/`confirmSide`/`executeTrade`,
with offers set directly because no UI path makes a two-copy offer. With two
swords offered and one gone before execute, the trade returns `ok: false` and
both inventories are unchanged. Before the fix the same script *passed* the
trade and duplicated a sword. Two-for-two plus a potion returns `ok`, A has 0
swords and B has 2, and item totals are conserved. `npm run typecheck` is
clean. Brief 19 hasn't landed, so the cases are not yet in `trade.test.ts`.
