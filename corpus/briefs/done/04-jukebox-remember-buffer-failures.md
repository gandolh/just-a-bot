# Task 04: Jukebox: remember a song that failed to buffer

## Context

`jukebox/buffer.ts:52-60` (`planBuffer`) plans a fetch for every upcoming id that is neither ready
nor fetching. When `prefetch()` fails, its catch (`:176-181`) deletes the `.part` file and the
fetching entry, so the id is planned again on the next `update()`. `link.ts` reports every 10 s
for playing players (`:126`), and each answer calls `setUpcoming` → `buffer.update`
(`player.ts:94`). One corrupt upload, an atrium 5xx on that file, or a missing ffmpeg means a
re-download, an ffmpeg spawn and a warning about 18 times during a 3-minute song.

Improvement sweep of 2026-10-20 (Jukebox lens), vetted against the code; the ranked report is the owner's "Repo improvement sweep" doc.

## Files you OWN

- `bots/discord/src/jukebox/buffer.ts`
- its tests

## What to do

1. Keep a set of failed ids; skip them until they leave `upcoming` (or for a few minutes), and log the failure once.

## Acceptance

- A test: a prefetch that throws is attempted once across three `update()` calls with the same upcoming list.

## Outcome (2026-11-02)

Built in `d3c707d`.

- `TrackBuffer` keeps `failed`, a map of id to the time its prefetch failed
  (not an abort). `planBuffer` takes an optional `failed` list, leaves those
  ids out of `fetch`, and returns `forget`: failed ids that are no longer in
  the next two. `update()` forgets those, and any entry older than
  `RETRY_FAILED_AFTER_MS` (5 minutes), so a transient atrium error is retried
  and a song that leaves the queue and comes back gets a fresh try. `clear()`
  empties it.
- The warning reads `buffering <id> failed: …; left alone for 5 minutes while
  it stays next`, once per attempt.
- The current Track was never prefetched and still plays from the live pipe;
  if that fails too, brief 02's path skips it as one `error`.
- `TrackBuffer` takes an optional clock for the test.

Checks: typecheck clean; bot tests 72/72. New: `planBuffer` leaves a failed
id out while it stays next and forgets it once it plays; a real `TrackBuffer`
with a fetch that throws is attempted once across three `update()` calls,
again after 5 minutes on the fake clock, and again when the song leaves and
comes back. The test's guild directory under `$TMPDIR/jukebox` is removed
afterwards. The docs' triage names the warning. The bot was not run.

**Owed by the owner:** nothing beyond the first live run.
