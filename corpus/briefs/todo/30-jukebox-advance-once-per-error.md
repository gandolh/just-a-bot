# Task 30: Jukebox: one playback error advances once

## Context

`jukebox/speaker.ts:80-87` forwards the AudioPlayer's Idle to `handlers.ended` and its `'error'` to
`handlers.error`; @discordjs/voice emits `'error'` and then Idle for a broken resource. Both
handlers enqueue `finished()` (`jukebox/player.ts:52-55`), and `finished()` reads `this.playId`
when it runs (`:184-186`). The first call asks atrium for the next play and starts it; the second
then advances the new play. Each unreadable file eats the following song.

Improvement sweep of 2026-10-20 (Jukebox lens), vetted against the code; the ranked report is the owner's "Repo improvement sweep" doc.

## Files you OWN

- `bots/discord/src/jukebox/player.ts`
- its tests

## What to do

1. Capture the playId when the event fires and pass it to `finished()`, which returns early if it is no longer current; or ignore `'error'` and let Idle carry the `failed()` flag.
2. Add a test: error then Idle gives exactly one advance call.

## Acceptance

- The new test passes, and the existing 62 still do.
