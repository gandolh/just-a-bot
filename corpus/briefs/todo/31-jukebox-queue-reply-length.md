# Task 31: Jukebox: keep `/jukebox queue` under Discord's 2000 characters

## Context

`jukebox/format.ts:82-85` (`trackLine`) and `:95-107` (`queueText`) join up to ten entries
(`QUEUE_SHOWN`) of `**title** — artist · album (added by name)` with nothing truncated. ID3 tags
from a classical or soundtrack library pass 2000 characters, `interaction.reply()` throws
DiscordAPIError 50035, and the member sees "Something went wrong running that command"
(`commands/jukebox.ts:145`). The docs promise the first ten queued songs.

Improvement sweep of 2026-10-20 (Jukebox lens), vetted against the code; the ranked report is the owner's "Repo improvement sweep" doc.

## Files you OWN

- `bots/discord/src/jukebox/format.ts`
- its tests

## What to do

1. Truncate each field (for example title 60, artist 40, album 40, name 32) with an ellipsis.
2. Stop adding lines when the next would pass about 1900 characters, and end with "…and N more".

## Acceptance

- A test with ten 300-character entries produces at most 2000 characters.
