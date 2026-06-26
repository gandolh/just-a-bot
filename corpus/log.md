# Log

Chronological record of meaningful corpus + project changes. Newest last.

## [2026-06-26] maintenance | corpus bootstrapped

Created `corpus/` at repo root: CLAUDE.md, index.md, log.md, routing.md, and
the wiki spine (overview, architecture, decisions, status, open-questions) plus
a [music](wiki/music.md) concept page. Seeded from the repo structure and the
in-flight music work.

## [2026-06-26] ingest | music playback fixed (joins-but-silent)

YouTube SABR/PO-token enforcement broke `discord-player-youtubei`'s youtubei.js
stream cascade — tracks resolved (so they "queued") but produced no audio. Fixed
by adding a `createStream` override in
[player.ts](../bots/discord/src/player.ts) that streams via `youtube-dl-exec`
(`bestaudio`) directly, bypassing the flaky client cascade + SABR. Updated the
bundled yt-dlp binary 2026.03.17 → 2026.06.09. See [music.md](wiki/music.md).

## [2026-06-26] todo | brief 01 filed — music audio quality + code cleanup

Set `/play` `volume: 100` (skips discord-player's PCM volume filter). Filed
[brief 01](briefs/done/01-music-audio-quality.md) for further audio-quality and
music-code improvements.

## [2026-06-26] done | Brief 01 — music audio quality + code cleanup

Shipped: `volume: 100`; yt-dlp format `bestaudio[acodec=opus]/bestaudio`
(WebM/Opus @ 48 kHz, Discord-native — ffmpeg remuxes instead of transcoding AAC);
new `commands/_music.ts` `getActiveQueue` helper deduping the six music control
commands; root `music:update-ytdlp` script. Typecheck clean; script verified.
True Opus passthrough deferred (needs live voice test) — see
[open-questions.md](wiki/open-questions.md). Brief →
[done](briefs/done/01-music-audio-quality.md).
