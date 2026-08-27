---
summary: Decisions that no longer bind — the music-provider trail (SoundCloud primary, then shelved, then the yt-dlp-only scope) kept for its reasoning, not as a live constraint.
updated: 2026-08-27
---

# Superseded decisions

These no longer constrain anything. They are kept because the *reasoning* still
explains how the code got the shape it had, and because a decision with no
recorded death is one somebody re-proposes. Live constraints:
[decisions.md](decisions.md).

Each entry keeps its original text; the superseding call is named at the end.

---

## Music source: SoundCloud primary, YouTube a disabled secondary

_2026-06-26_ — SoundCloud is the (temporary) primary provider; the YouTube path
is kept in code behind `YOUTUBE_ENABLED = false` and marked `@deprecated`.
Rejected: YouTube as primary (blocks the VPS datacenter IP — "Sign in to confirm
you're not a bot"), yt-dlp cookies as the standing fix (expire every ~2 weeks,
manual refresh forever).
Reason: SoundCloud streams natively through discord-player's default extractors
with no auth and is not IP-blocked. Cost accepted: a much smaller catalog and
0:30 previews on non-freely-streamable tracks. Detail: [music.md](music.md).

**Revisited 2026-08-27 — superseded within the day: the entire provider stack was
removed, not just the yt-dlp half.** See "Music subsystem removed entirely" above;
the scope below was the intermediate decision and is kept for the trail.
`youtube-dl-exec`, `streamWithYtDlp`, the `createStream` override,
`YT_COOKIES_FILE` and `npm run music:update-ytdlp` all go; the youtubei extractor,
`YOUTUBE_ENABLED` and `YT_COOKIE` stay. Decided deliberately over removing the
whole secondary.

**Consequence a future reader must not miss: flipping `YOUTUBE_ENABLED` back to
`true` will no longer work.** Without the yt-dlp `createStream` override, the
youtubei extractor resolves metadata and yields no audio — SABR/PO-token
enforcement — which is the exact original bug from 2026-06-26. Re-enabling YouTube
now means supplying a *new* stream source first. It also removes the
yt-dlp-through-a-residential-proxy route that
[reenable-music.md](../todos/reenable-music.md) lists as a revival option.

## ~~Music feature shelved by commenting out its commands, not deleting the code~~

_2026-06-26_ — With no VPS-viable audio source, the seven music commands were
commented out of `bots/discord/src/commands/index.ts` so they vanish from
Discord; all player code stays intact. Rejected: deleting the subsystem,
shipping it visibly broken.
Reason: the blocker is external (provider IP-blocking), not a code defect — the
work is worth preserving verbatim so re-enabling is uncommenting once a source
streams from the VPS.
**Status: superseded 2026-08-27 by "Music subsystem removed entirely" above.** The
code preservation this decision existed to protect was deliberately given up; the
hold outlasted the value of carrying the dependencies. Kept here because the
reasoning was sound at the time and explains why the code survived two months.
