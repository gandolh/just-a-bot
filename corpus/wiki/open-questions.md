---
summary: The genuinely unresolved threads only — currently just the fate of the /dicetable client; music-blocked questions live in the reenable-music todo instead.
updated: 2026-08-27
---

# Open questions

Only genuinely unresolved threads. Delete each the moment it's answered.

A question that is **blocked** rather than unanswered does not belong here — it
is a step in whatever plan unblocks it. Two such questions (automating yt-dlp
freshness, Opus passthrough viability) moved to
[reenable-music.md](../todos/reenable-music.md) on 2026-08-27: neither is askable
while music is shelved and YouTube is disabled, because nothing in the repo runs
yt-dlp at all.

- **What to do with `/dicetable`.** It is a WebSocket client of the
  `dice-activity` app, which was removed from this repo on 2026-08-27. The
  command degrades cleanly (answers "not configured" without
  `DICETABLE_ACTIVITY_URL`), so nothing is broken — but it can never succeed as
  things stand. Three options, undecided: host the Activity from its own repo and
  point `DICETABLE_ACTIVITY_URL` at it; shelve the command the way music was
  shelved (comment it out of `commands/index.ts`, keep the code); or delete the
  feature and `shared/src/dice-protocol.ts` with it. Nobody has said which.
