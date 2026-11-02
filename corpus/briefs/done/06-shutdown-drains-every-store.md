# Task 06: Shutdown drains every store, even when one RPG world fails

## Context

`bots/discord/src/index.ts:243-246` runs `await flushAllWorlds(); await flushPendingWrites();` in
one async block whose catch only logs. If any RPG world write fails (EACCES, ENOSPC or EIO on the
bind mount), `flushPendingWrites()` never runs, so wallet, quote, mafia, reminder and birthday
writes queued in the last moments are abandoned before `process.exit`. `rpg/world.ts:253` also
runs `dirty.delete(guildId)` before the write succeeds, so a world whose flush failed is not
retried by the shutdown flush. `flushAllWorlds` (`:283-285`) uses `Promise.all`.

Improvement sweep of 2026-10-20 (fixes of 2026-10-02 lens), vetted against the code; the ranked report is the owner's "Repo improvement sweep" doc.

## Files you OWN

- `bots/discord/src/index.ts` (shutdown)
- `bots/discord/src/rpg/world.ts` (flush)
- tests

## What to do

1. Run both flushes with `Promise.allSettled` and log each rejection.
2. In `flush()`, clear the dirty flag only after the write succeeds; make `flushAllWorlds` use `allSettled`.

## Acceptance

- A test with a failing world write: `flushPendingWrites` still runs, and the world stays dirty.

## Outcome (2026-11-02)

Built in `e0ee213`.

- `drain.ts`'s `drainStores()` runs named flushes with `Promise.allSettled`
  and logs each failure (`Flushing RPG worlds on shutdown failed …`).
  Shutdown passes it `flushAllWorlds` and `flushPendingWrites`, still inside
  the 3 s bound beside the Jukebox stop. The world writes are queued
  synchronously when the first flush starts, so the pending-writes drain
  waits for them too.
- `flush()` in `rpg/world.ts` re-marks a world dirty when its write fails.
  It deliberately still clears the flag when it takes the snapshot rather
  than after the write succeeds, as the brief put it: a move made while the
  write runs marks the world again, and clearing on success would erase that
  mark and lose the move.
- `flushAllWorlds()` flushes every dirty world with `allSettled` and rejects
  once, with an `AggregateError` naming the failed guilds.
- `setWorldWriterForTests()` swaps the world writer, so the test fails a
  write without touching `bots/discord/data/`.

Checks: typecheck clean; bot tests 77/77. New `drain.test.ts`: a failing
flush does not stop the other, and is named; with the world writer failing
with ENOSPC, a wallet-style `writeJsonFile` to a temp directory still lands,
and the next `flushAllWorlds` writes the world (it stayed dirty). The bot was
not run.

**Owed by the owner:** nothing to check by hand; a failed world write shows
in `pm2 logs` as `[shutdown] Flushing RPG worlds on shutdown failed`.
