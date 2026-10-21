# Task 32: Jukebox: remember a song that failed to buffer

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
