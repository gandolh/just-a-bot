---
title: Rebuild music from scratch once a VPS-viable audio source exists
created: 2026-06-26
status: open
tags: [music, youtube, soundcloud, vps, lavalink]
---

# Rebuild music once a VPS-viable audio source exists

> **This is no longer an "uncomment it" task.** On 2026-08-27 the whole subsystem
> was deleted — 333 lines plus all eight audio dependencies. Reviving music means
> **building it again**, against whatever provider wins the research.
>
> The old implementation is one command away:
> `git show 4d03ca0:bots/discord/src/player.ts` (same for `commands/play.ts`,
> `commands/_music.ts`, and the six control commands). Treat it as a reference,
> not a starting point — if the answer is Lavalink, none of the discord-player
> glue transfers anyway.
>
> **What actually carries forward is the knowledge**, not the code:
> [music.md](../wiki/music.md) is the post-mortem, and the four non-obvious
> settings it records (`skipFFmpeg: false`, `volume: 100`, the SoundCloud priority
> bump, the Opus format string) each cost real debugging time.

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

## What the implementation used to be (deleted — reference only)

- [commands/index.ts](../../bots/discord/src/commands/index.ts): the 7 music
  commands (play/skip/pause/resume/stop/queue/nowplaying) are commented out of
  the imports and the `all` array. Uncomment to restore.
- `player.ts`: SoundCloud = primary
  (`SoundCloudExtractor.priority = 100`), `Player({ skipFFmpeg: false })`.
  YouTube = disabled secondary behind `YOUTUBE_ENABLED = false` (+ `@deprecated`
  `streamWithYtDlp`). `initPlayer` is still called on startup (harmless).
- `play.ts`: searches
  `QueryType.SOUNDCLOUD_SEARCH`, `volume: 100`.
- Both cookie env vars (`YT_COOKIE`, `YT_COOKIES_FILE`) and the
  `music:update-ytdlp` script are gone from `env.ts` and `package.json`.

## Next steps (when picking this back up)

1. **Run the cheap test before building anything.** The one experiment never
   attempted: does a **fully streamable** (non-preview) SoundCloud track play from
   the VPS? Every failure recorded above was measured against a 0:30 preview,
   which is a known-broken input — so SoundCloud was never actually disproven.
   Restore just enough to try it (`git show` the old player, or a throwaway
   script), `/play ncs spectre`, and check the log shows a real duration and
   `playbackDuration` climbing past 120 ms. **If that works, the whole "no viable
   source" premise is wrong** and the rebuild is small.
2. **If SoundCloud full tracks also fail**, the realistic VPS options are — all of
   which now mean adding dependencies back, not flipping a flag:
   - **Lavalink** — dedicated Java audio server (handles extraction + tokens
     robustly); the standard fix for VPS music bots. Most setup, most reliable.
   - **YouTube via residential proxy** — re-add `youtube-dl-exec` +
     `discord-player-youtubei`, restore the `createStream` override, route yt-dlp
     through `--proxy`. Paid proxy, full catalog.
   - **yt-dlp cookies** — same re-add, plus `YT_COOKIES_FILE`. Works, but a manual
     ~2-week refresh forever. **Explicitly ruled out by the user** as the standing
     fix ("without having to do some cookie forgery").
3. After a source works: rebuild the player and the commands, re-add the audio
   deps (`@discordjs/voice`, `@discordjs/opus`, `sodium-native`, `ffmpeg-static`
   at minimum), `npm run discord:register`, `pm2 restart discord`, and verify a
   real `/play` on the VPS produces sound. A typecheck proves nothing here — the
   failure mode is silence, not a compile error.

## Questions to settle *when* a source works (not before)

Both moved here from `wiki/open-questions.md` on 2026-08-27 — neither is askable
while nothing in the repo runs yt-dlp:

- **Automating yt-dlp freshness.** ~~Moot~~ — doubly so now: yt-dlp is no longer
  a dependency at all. If the YouTube route is ever rebuilt, decide then between a
  `postinstall` `yt-dlp -U`, a cron, or tracking a newer `youtube-dl-exec`.
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
