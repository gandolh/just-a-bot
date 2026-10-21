# Task 34: Shutdown drains every store, even when one RPG world fails

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
