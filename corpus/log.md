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

## [2026-06-26] incident | DiscordAPIError 40060 on /play (duplicate interaction)

`/play` threw "Interaction has already been acknowledged" (40060) at
`deferReply`. **Root cause: the same `DISCORD_TOKEN` was running in two places at
once — local `discord:dev` AND the VPS (pm2) deployment.** Discord delivers each
interaction to every live gateway session of a bot, so both instances ran
`execute` and called `deferReply`; the loser of the race 40060'd. Verified there
is only one local process and exactly one `InteractionCreate` listener in code,
so it is NOT a double-registered listener, NOT a music bug, and NOT (primarily)
the tsx-watch reload overlap.

Fix / rule: one running instance per bot token. Best practice — use a **separate
Discord application + token for local dev** (set in local `.env`), leaving the
VPS on the production token; `env.ts` + `GUILD_ID` already support this with no
code change.

A graceful SIGINT/SIGTERM shutdown was also added to
[index.ts](../bots/discord/src/index.ts) (`client.destroy()` on exit) — good
hygiene for clean `tsx watch` reloads and pm2 restarts, but not the cause here.
The `ephemeral: true` deprecation warning (142 sites) is separate and still open.

## [2026-06-26] incident | VPS music silent — YouTube anti-bot block

After ruling out the duplicate-instance 40060 (ran VPS-only), `/play` still
joined and was silent while all other commands worked. `pm2 logs` showed yt-dlp
exiting code 1 with `Sign in to confirm you're not a bot` — YouTube blocks the
Hetzner datacenter IP and won't stream without auth (works on residential/local
IPs). Fix: added `YT_COOKIES_FILE` env → passed to yt-dlp as `--cookies` in
[player.ts](../bots/discord/src/player.ts) `streamWithYtDlp`. User must drop a
Netscape `cookies.txt` on the VPS and set the env var. See
[music.md](wiki/music.md).

## [2026-06-26] decision | Music feature shelved — commands disabled

SoundCloud also failed on the VPS: extraction + voice connect succeed, but the
test track returned a 0:30 preview and even `skipFFmpeg:false` left it at
`playbackDuration: 120` ms then finished (empty/unreadable preview stream). With
YouTube IP-blocked and yt-dlp same, no direct-from-VPS source works. Shelved the
feature: commented the 7 music commands out of
[commands/index.ts](../bots/discord/src/commands/index.ts) (hidden from Discord);
all code kept intact. Full resume plan + saga in
[reenable-music.md](todos/reenable-music.md). Likely endgame: Lavalink or YouTube
+ residential proxy.

## [2026-06-26] decision | SoundCloud primary, YouTube disabled secondary

With no low-maintenance cookie-free way past YouTube's VPS IP block, switched the
music source: **SoundCloud** is now the temporary primary provider (active,
streams natively, `SOUNDCLOUD_SEARCH`), and **YouTube** is the disabled secondary
(`YOUTUBE_ENABLED = false` in [player.ts](../bots/discord/src/player.ts), yt-dlp
path kept + `@deprecated`). Music commands stay live. Filed
[todo](todos/revisit-youtube-provider.md) to re-enable YouTube later. Wiki:
[music.md](wiki/music.md), [decisions.md](wiki/decisions.md).

## [2026-06-26] done | Brief 01 — music audio quality + code cleanup

Shipped: `volume: 100`; yt-dlp format `bestaudio[acodec=opus]/bestaudio`
(WebM/Opus @ 48 kHz, Discord-native — ffmpeg remuxes instead of transcoding AAC);
new `commands/_music.ts` `getActiveQueue` helper deduping the six music control
commands; root `music:update-ytdlp` script. Typecheck clean; script verified.
True Opus passthrough deferred (needs live voice test) — see
[open-questions.md](wiki/open-questions.md). Brief →
[done](briefs/done/01-music-audio-quality.md).
