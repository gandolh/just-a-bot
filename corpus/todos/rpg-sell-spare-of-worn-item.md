---
title: The RPG shop won't sell a spare copy of an item you wear
created: 2026-11-04
status: open
tags: [rpg, bug]
---

# The RPG shop won't sell a spare copy of an item you wear

Found while rewriting the RPG manual (brief 12, 2026-11-04). Equipping an
item takes it out of the bag, so a worn item is never in `inventory`. Yet
the Town screen's sell menu (`buildRows` in `bots/discord/src/rpg/locationui.ts`)
drops every bag slug equal to the worn weapon or armor, and `sellItem()` in
`rpg/shop.ts` refuses the same slugs with "is equipped — unequip it first".
A player wearing a Rusty Dagger with a second one in the bag can't sell the
spare. The trade menu has no such filter, so the spare can still be traded.

Both checks look like leftovers from before equipping moved items out of the
bag. Dropping them would let the spare sell; nothing worn can reach the menu
either way.
