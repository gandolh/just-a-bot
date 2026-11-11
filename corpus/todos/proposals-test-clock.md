---
title: The RPG proposals test fails when the clock ticks during its setup
created: 2026-11-11
status: open
tags: [rpg, tests]
---

# The RPG proposals test fails when the clock ticks during its setup

Found while building brief 18 (2026-11-11). In
`bots/discord/src/rpg/proposals.test.ts`, "closed trades go, open ones stay a
day, and an expired duel stays a day for its late presses" takes
`const now = Date.now()` before it creates its records, and then prunes at
`now + SOCIAL_RECORD_TTL_MS + 1`. But `startTrade` stamps `createdAt` from the
real clock, and `startDuel`'s own prune stamps the legacy trade from the
real clock too. When a millisecond passes between `now` and those calls, a
record is exactly one TTL old or younger at the second prune, so it stays, and
the test fails with `['trade-1', 'trade-3']` or `['trade-3']` left over.

It fails often on a busy machine: 3 of 5 runs of `npm run test:clean` on
`8c97077` (before brief 18) and 2 of 5 after, with the load average between 5
and 20. It makes `npm run check` red about as often.

The fix is in the test: take the second prune's time from the clock after the
records exist (`Date.now() + SOCIAL_RECORD_TTL_MS + 1`), or freeze the clock
with node:test's `mock.timers` (`apis: ["Date"]`). Nothing in `world.ts`
changes.
