---
summary: The genuinely unresolved threads only — yt-dlp freshness, Opus passthrough, and what happens to the dormant /dicetable client.
updated: 2026-08-27
---

# Open questions

Only genuinely unresolved threads. Delete each the moment it's answered.

- **Keeping yt-dlp fresh automatically.** The bundled binary goes stale and
  `npm install` may reset it. Options: a `postinstall`/`prestart` `yt-dlp -U`,
  a periodic cron, or pinning a newer `youtube-dl-exec`. Not yet decided — see
  [brief 01](../briefs/done/01-music-audio-quality.md).
- **What to do with `/dicetable`.** It is a WebSocket client of the
  `dice-activity` app, which was removed from this repo on 2026-08-27. The
  command degrades cleanly (answers "not configured" without
  `DICETABLE_ACTIVITY_URL`), so nothing is broken — but it can never succeed as
  things stand. Three options, undecided: host the Activity from its own repo and
  point `DICETABLE_ACTIVITY_URL` at it; shelve the command the way music was
  shelved (comment it out of `commands/index.ts`, keep the code); or delete the
  feature and `shared/src/dice-protocol.ts` with it. Nobody has said which.
- **Opus passthrough viability.** Whether YouTube `bestaudio` is reliably WebM
  Opus at 48 kHz (letting us skip ffmpeg re-encode for lower CPU + better
  quality) or whether the occasional m4a/AAC source forces a transcode anyway.
  Needs measurement against real tracks.
