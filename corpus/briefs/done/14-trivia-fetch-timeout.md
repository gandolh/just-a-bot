# Task 14 — Trivia: time out the OpenTDB fetch and fall back

## Context

Source: the 2026-09-26 improvements audit, recorded in [log.md](../../log.md).
Rank 11 of 16.

`fetchQuestion` in `bots/discord/src/trivia/api.ts:84` calls
`fetch('https://opentdb.com/api.php?...')` with no timeout. `commands/trivia.ts`
defers the reply first and then awaits `fetchQuestion`.

The catch at `api.ts:103-105` handles errors, but a request that hangs never
errors. The user sees "thinking…" until Discord's 15-minute interaction window
closes, and then the final edit fails too.

The bot already ships a fallback question bank (`trivia/fallback.ts`), which that
same catch returns on any error. It also already uses `AbortSignal.timeout` for
image uploads (`img/upload.ts:35`).

## Files you OWN

- `bots/discord/src/trivia/api.ts`

## What to do

1. Pass `{ signal: AbortSignal.timeout(5_000) }` to the fetch. On timeout the
   abort rejects into the existing catch, which returns `fromFallback(...)`.
   Nothing else changes.

## Acceptance

- `npm run typecheck` clean.
- In a tsx scratch script, stub `globalThis.fetch` with
  `(_url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason)))`
  and call `fetchQuestion()`. It resolves with a fallback question in about 5 s.
- `/trivia` still serves OpenTDB questions when the API is up.

## Outcome (2026-10-02)

The OpenTDB fetch now passes `signal: AbortSignal.timeout(5_000)`. The abort
rejects into the existing catch, which returns `fromFallback(...)`. Nothing else
changed.

Verified with a tsx scratch script that stubs `fetch` to hang until aborted:
`fetchQuestion()` resolved with a fallback question in 5.0 s. Note for anyone
repeating it: `AbortSignal.timeout`'s timer is unref'd, so a bare script exits
before it fires. The script needs a keep-alive interval standing in for the
bot's gateway socket. `npm run typecheck` is clean. The live `/trivia` check is
still owed.
