# Task 19 — Add a zero-dependency test suite for the pure game logic

## Context

Source: the 2026-09-26 improvements audit, recorded in [log.md](../../log.md).
Rank 16 of 16 ("Next": nothing is broken today, but it makes the other fixes
stick).

There is no test suite. `npm run typecheck` is the only check (root `CLAUDE.md`).
Several modules are pure, carry real game rules, and have branches a type checker
can't catch. This audit found real bugs in exactly that kind of code: the trade
dupe (brief 08), the clock offset (brief 09) and the unwinnable hangman word
(brief 16).

Node 22 ships `node:test`, and `tsx` (already a root devDependency) runs
TypeScript test files through `node --import tsx --test`. No new dependencies.

## Targets

- `gambling/blackjack.ts` `handValue` (`:23-43`). Test demoting several aces from
  11 to 1: {A,A,9} = 21, {A,A,A,8} = 21. Also `isBlackjack` (`:45`): {A,K} is
  blackjack, a three-card 21 is not.
- `wordle/game.ts` `evaluate` (`:33`). Test duplicate letters: a guess with two
  E's against a target with one E marks exactly one E. Cover targets with 0, 1
  and 2 E's.
- `connect-four/game.ts`. `checkWinner` (`:25`) isn't exported, so test it
  through `dropDisc` (`:54`): wins in all four directions, and one near-win that
  isn't a win. Also cover the draw check (`:74`), which assumes that a full top
  row means a full board.
- `shared/src/reminders/parse.ts`:
  - `parseDuration` for each unit
  - `parseAbsolute` "tomorrow 12am" → 00:00 UTC and "tomorrow 12pm" → 12:00 UTC
  - the ISO branch

  Use `t.mock.timers`, or compare against `Date.now()` deltas.
- `rpg/trade.ts` `executeTrade`. After a successful trade, each item's count and
  the coin total are the same as before. If brief 08 has landed, add the
  multi-copy dupe case. Otherwise mark that case `{ todo: 'brief 08' }`.
- `hangman/words.ts`. Every word matches `/^[a-z]+$/` (brief 16).

## Files you OWN

- Root `package.json`, `bots/discord/package.json` and `shared/package.json`:
  `scripts.test` only
- New `*.test.ts` files, placed next to the modules they test
- Root `CLAUDE.md`: the "Verify with" bullet
- `docs/common/setup.md`: the command list

## Files you must NOT touch

- **The modules under test.** This brief adds tests only. If a test exposes a new
  bug, file a new brief for it instead of fixing it here.
- **Sequencing.** Brief 10 edits the same `package.json` files, brief 12 edits
  `CLAUDE.md`, and brief 11 edits `docs/common/setup.md`. Don't run this brief in
  the same wave as any of them.

## What to do

1. Add `"test": "node --import tsx --test \"src/**/*.test.ts\""` to
   `bots/discord` and `shared`, and `"test": "npm run test --workspaces --if-present"`
   to the root.
2. Write the tests above as `<module>.test.ts` next to each module. They sit
   under `src/**`, so `typecheck` covers them too.
3. In root `CLAUDE.md`, drop "There is no test suite" and change the bullet to
   "Verify with `npm run typecheck` and `npm test`". Add `npm test` to the
   command list in `docs/common/setup.md`.

## Acceptance

- `npm test` from the root passes in under 10 s.
- `npm run typecheck` clean.
- Temporarily delete the ace-demotion loop in `handValue`. A test fails. Then put
  the loop back.

## Outcome (2026-10-02)

`npm test` runs `node --import tsx --test "src/**/*.test.ts"` in `bots/discord`
and `shared`, via `npm run test --workspaces --if-present` at the root. There
are no new dependencies. 24 tests, about 0.7 s for the whole run.
- **Blackjack:** ace demotion ({A,A,9}, {A,A,A,8}), soft hands, and
  `isBlackjack` (a two-card 21 only).
- **Wordle:** duplicate Es against targets with 0, 1 and 2 Es, with exact
  expected marks.
- **Connect Four, through `dropDisc`:** a win in each of the four directions
  (the two diagonals were checked to win on a diagonal), a gapped near-win, a
  42-move full-board draw, and the full-column and finished-game refusals.
- **Reminder parsing:** `parseDuration` for every unit, "tomorrow 12am/12pm"
  as 00:00/12:00 UTC, the ISO branch and `parseWhen`.
- **Trades:** item and coin conservation, plus the brief 08 multi-copy case,
  which has landed, so it is a real test and not a todo.
- **Hangman:** every word matches `^[a-z]+$`.
- **Beyond the targets:** `reminderMessage` truncation (brief 15).

The root `CLAUDE.md` "Verify with" bullet and `docs/common/setup.md` name
`npm test`, and the manual copy is re-synced.

Verified: `npm test` passes 20 + 4 and `npm run typecheck` is clean.
**Mutation:** with the ace-demotion loop deleted from `handValue`, two tests
fail; with it restored, all pass. No test exposed a new bug.
