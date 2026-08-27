---
title: Re-enable the music feature once a VPS-viable audio source works
created: 2026-06-26
status: open
tags: [music, youtube, soundcloud, vps, lavalink]
---

# Re-enable the music feature

The music commands are **disabled** (commented out in
[commands/index.ts](../../bots/discord/src/commands/index.ts)) so they don't
appear in Discord. All the code is kept intact — re-enabling is mostly
uncommenting once we have a source that actually streams audio from the VPS.

## Why it's shelved

Every direct-from-VPS source we tried joins voice but plays **no audio**
(`playbackDuration: 120` ms then "Finished" in the logs):

1. **YouTube via discord-player-youtubei (youtubei.js cascade)** — SABR/PO-token
   enforcement; stream resolves but yields no audio.
2. **YouTube via yt-dlp** (`createStream` override) — works on residential/local
   IPs, but the Hetzner VPS IP is blocked: `Sign in to confirm you're not a bot`.
   yt-dlp cookies (`YT_COOKIES_FILE`) would fix it but expire ~2 weeks.
3. **SoundCloud** (made temporary primary, `SOUNDCLOUD_SEARCH`) — extraction +
   voice connect succeed, but: the test track returned a **0:30 preview**, and
   even with `skipFFmpeg: false` it still played 120 ms then finished (empty/
   unreadable preview stream, likely HLS). **Untested:** whether a fully-
   streamable (non-preview) SoundCloud track plays on the VPS — that test was
   never run before shelving.

## Current code state (kept, ready to re-enable)

- [commands/index.ts](../../bots/discord/src/commands/index.ts): the 7 music
  commands (play/skip/pause/resume/stop/queue/nowplaying) are commented out of
  the imports and the `all` array. Uncomment to restore.
- [player.ts](../../bots/discord/src/player.ts): SoundCloud = primary
  (`SoundCloudExtractor.priority = 100`), `Player({ skipFFmpeg: false })`.
  YouTube = disabled secondary behind `YOUTUBE_ENABLED = false` (+ `@deprecated`
  `streamWithYtDlp`). `initPlayer` is still called on startup (harmless).
- [play.ts](../../bots/discord/src/commands/play.ts): searches
  `QueryType.SOUNDCLOUD_SEARCH`, `volume: 100`.
- yt-dlp cookies wired via `YT_COOKIES_FILE` env (unused while YouTube disabled).
- `npm run music:update-ytdlp` keeps the bundled yt-dlp current.

## Next steps (when picking this back up)

1. **Quick test first:** uncomment commands, `/play ncs spectre` (a fully-
   streamable track), check the log shows a real duration (not 0:30) and
   `playbackDuration` climbing past 120. If full SoundCloud tracks play, SoundCloud
   is viable (accepting the smaller catalog + preview-gated tracks failing).
2. **If SoundCloud full tracks also fail**, the realistic VPS options are:
   - **Lavalink** — dedicated Java audio server (handles extraction + tokens
     robustly); the standard fix for VPS music bots. Most setup, most reliable.
   - **YouTube via residential proxy** — flip `YOUTUBE_ENABLED = true` and route
     yt-dlp through `--proxy`. Paid proxy, but full YouTube catalog.
   - **yt-dlp cookies** — flip `YOUTUBE_ENABLED = true`, set `YT_COOKIES_FILE`.
     Works but manual ~2-week refresh.
3. After a source works: uncomment the commands, `npm run discord:register`,
   `pm2 restart discord`, verify a real `/play` on the VPS produces sound.

## Questions to settle *when* a source works (not before)

Both moved here from `wiki/open-questions.md` on 2026-08-27 — neither is askable
while nothing in the repo runs yt-dlp:

- **Automating yt-dlp freshness.** The bundled binary goes stale and
  `npm install` may reset it. Options: a `postinstall`/`prestart` `yt-dlp -U`, a
  periodic cron, or tracking a newer `youtube-dl-exec`. Only matters if the
  YouTube path is re-enabled — `npm run music:update-ytdlp` is the manual stopgap.
  Background: [brief 01](../briefs/done/01-music-audio-quality.md).
- **Opus passthrough viability.** Whether YouTube `bestaudio` is reliably WebM
  Opus at 48 kHz (letting us skip the ffmpeg re-encode for lower CPU and better
  quality) or whether the occasional m4a/AAC source forces a transcode anyway.
  Needs measurement against real tracks. **Note the conflict:** passthrough needs
  `skipFFmpeg: true`, but SoundCloud *requires* `skipFFmpeg: false` — so this can
  only ever apply if YouTube returns as the primary provider.

## Research direction (2026-08-27)

Hold is **active, not closed**: the user is looking for either a different
provider or a way to make YouTube play smoothly **without cookie forgery** —
cookies are explicitly ruled out as the standing fix (~2-week manual refresh).
Nothing in the code changes until such a source is proven from the VPS.

Ruled out so far: youtubei.js cascade (SABR/PO tokens), yt-dlp direct (datacenter
IP block), yt-dlp + cookies (works, but manual refresh forever). Still untried:
**step 1 below — the cheapest test in this file, and it has never been run.**

See [music.md](../wiki/music.md) and the 2026-06-26 incidents in
[log.md](../log.md). Supersedes the narrower
[revisit-youtube-provider.md](revisit-youtube-provider.md).
