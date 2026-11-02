# Task 02: Jukebox: one playback error advances once

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

## Outcome (2026-11-02)

Built in `77af1d2`.

- `GuildPlayer` keeps `sounding`, the playId whose stream the speaker has
  (set right after `speaker.play()`, cleared on idle). The `ended` and `error`
  handlers capture it, and the `failed()` flag, when the event fires.
- `finished(reason, playId)` returns early when `playId` is no longer the
  current play, and remembers the last play it asked about, so a second
  event for the same play is dropped even when atrium's answer (`{play:
  null}`, `stale`, or a network failure) leaves `playId` unchanged. Retries
  (`attempt > 0`) bypass that memory.
- Capturing `this.playId` at event time, the 2026-10-28 plan, was not enough:
  `start()` sets `playId` before it awaits `buffer.open()` (up to 15 s on a
  live fetch), so the old song's Idle in that window would have advanced the
  new play. `sounding` covers it.
- Found while reading atrium: the second advance said `ended`, which resets
  atrium's count of failed songs in a row, so its five-song failure budget
  (2026-10-27) never tripped on a buffered file. Each broken song now counts.
- Also corrected, outside the files the brief owned: `format.ts`'s
  `PlayerView` gains atrium's `failure: string | null`, and `nowPlayingText`
  (so `/jukebox nowplaying` and `queue`) says "Nothing is playing. Playback
  stopped: 5 songs in a row would not play, the last “…”." The docs' command
  table and triage say so.

Checks: typecheck clean; bot tests 68/68. New: error then Idle gives one
advance, `{playId: 1, reason: 'error'}`, and the next song plays; with
`{play: null}` and with `stale` the second event gives no second call; the
old song's Idle while the next opens gives no advance; the failure text.
The three player tests fail on the previous `player.ts`. The bot was not run.

**Owed by the owner** (first live run): a song whose file atrium cannot serve
moves on to the next song, which plays to its end.
