# Task 03: Jukebox: keep `/jukebox queue` under Discord's 2000 characters

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

## Outcome (2026-11-02)

Built in `ad37ab7`.

- `format.ts` gains `clip(text, max)`, which cuts by code points (an emoji
  is never split) and ends with "…". `trackLine` clips the title to 60, the
  artist and album to 40; the "added by" name is clipped to 32 and atrium's
  `failure` text to 200.
- `queueText` adds Queue lines while the reply stays within 1900 characters
  (`REPLY_BUDGET`), then ends with "…and N more" counting every entry left
  out, whether past the tenth or past the budget.
- The brief's numbers were kept. Ten entries with 300-character fields give
  1775 characters: eight listed, "…and 2 more".

Checks: typecheck clean; bot tests 70/70. New: ten 300-character entries
(and a 300-character current song) stay at or under 2000 characters, with the
listed lines plus the counted rest equal to ten; `clip` on short, long and
emoji input. The docs' command table says long fields are cut. The bot was
not run.

**Owed by the owner** (first live run, optional): `/jukebox queue` with a few
long-titled songs queued answers instead of "Something went wrong".
