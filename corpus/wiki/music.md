---
summary: Post-mortem of the removed /play music subsystem — every provider tried and how each failed from a datacenter IP, plus the hard-won settings (skipFFmpeg, volume, format) any future attempt must not rediscover.
updated: 2026-08-27
---

# Music subsystem (`/play`)

> **REMOVED (2026-08-27) — this is a post-mortem, not a description of code.**
> The music subsystem is gone: 333 lines (`player.ts`, `commands/_music.ts`, the
> seven commands) deleted along with all eight audio dependencies
> (`discord-player`, `@discord-player/extractor`, `discord-player-youtubei`,
> `@discordjs/voice`, `@discordjs/opus`, `sodium-native`, `ffmpeg-static`,
> `youtube-dl-exec`).
>
> **The code is one command away:** `git show :bots/discord/src/player.ts`
> (and the same for `commands/play.ts` etc.). That commit is the last one
> containing the subsystem.
>
> This page is kept deliberately. The *findings* below — which providers fail from
> a datacenter IP and how, and the four non-obvious settings that took a day to
> establish — are what a future attempt must not have to rediscover. The glue code
> is worth little by comparison; if the revival is Lavalink, none of it transfers.
> Plan: [reenable-music.md](../todos/reenable-music.md).

What the stack *was*, and why every route out of the VPS failed. Written in the
past tense throughout — nothing described here exists in the working tree.

## Providers (2026-06-26)

Configured in `player.ts` `initPlayer`:

- **SoundCloud — PRIMARY (temporary, active).** Comes from
  `@discord-player/extractor`'s `DefaultExtractors`; we bump
  `SoundCloudExtractor.priority = 100`. `/play` searches it via
  `QueryType.SOUNDCLOUD_SEARCH`. Streams **natively** (no yt-dlp, no auth) and
  isn't IP-blocked on the VPS. Trade-off: smaller catalog than YouTube.
- **YouTube — SECONDARY, DISABLED.** discord-player-youtubei +
  `streamWithYtDlp` (yt-dlp `createStream` override) are kept in code but gated
  behind `const YOUTUBE_ENABLED = false` and marked `@deprecated`, because
  YouTube blocks the VPS datacenter IP. Flip the flag to re-enable. See
  [todo](../todos/revisit-youtube-provider.md).

## Stack

- **discord-player 7.2.0** — queue/player orchestration (`Player` singleton).
- **@discord-player/extractor 7.2.0** — default extractors incl. the active
  **SoundCloud** source, loaded via `DefaultExtractors`.
- **discord-player-youtubei (3.0.0-beta.4)** — YouTube extractor (disabled).
- **@discordjs/voice 0.19.2 + @discordjs/opus + sodium-native** — voice
  transport + Opus encoding + encryption (native, no slow `opusscript` path).
- **ffmpeg-static** — audio transcode/remux.
- **youtube-dl-exec (yt-dlp)** — audio stream source for the *disabled* YouTube
  path only.

## How a `/play` flows (SoundCloud)

1. `play.ts` validates the user is in a
   voice channel, then calls `player.play(channel, query, { searchEngine:
   SOUNDCLOUD_SEARCH, nodeOptions })`.
2. The SoundCloud extractor resolves the query → a `Track` and streams it
   natively.
3. discord-player pipes that through ffmpeg → Opus → `@discordjs/voice`.

`nodeOptions`: `leaveOnEnd`/`leaveOnEmpty` (60 s cooldown), `selfDeaf: true`,
`volume: 100`.

## `skipFFmpeg: false` is required (2026-06-26)

The `Player` is constructed with `{ skipFFmpeg: false }`. SoundCloud serves
MP3/AAC (and HLS previews); with discord-player's default `skipFFmpeg` it pipes
the raw stream straight to the Opus packetizer, which produces no decodable
audio — the track "plays" ~120 ms then finishes (silent). Forcing ffmpeg
transcodes everything to Opus. Symptom to watch for if this regresses:
`playbackDuration: 120` and an immediate `Finished` in `pm2 logs`.

## Caveat: SoundCloud 30-second previews

Some SoundCloud tracks (Go+ / not freely streamable) return only a **0:30
preview** — the extractor reports `durationMS: 30000`. There's no cookie-free way
around this; full playback only works for freely-streamable tracks. This is part
of the SoundCloud catalog trade-off, separate from the `skipFFmpeg` bug above.

## Why YouTube is disabled (the big decision)

YouTube enforces **SABR streaming + PO tokens** and blocks datacenter IPs. The
youtubei.js stream cascade yielded no audio, so we bypassed it with a yt-dlp
`createStream` override — which worked locally but hit YouTube's
**"Sign in to confirm you're not a bot"** wall on the VPS (silent playback). With
no low-maintenance cookie-free bypass, YouTube was demoted to a disabled
secondary and **SoundCloud** made the active primary. History in
[log.md](../log.md).

## Audio quality

- **`volume: 100`** in `nodeOptions` — any value ≠ 100 routes audio through
  discord-player's software PCM volume filter, which resamples and degrades
  quality. 100 skips it.
- **Format selection:** yt-dlp requests `bestaudio[acodec=opus]/bestaudio`,
  which yields **WebM/Opus @ 48 kHz** — Discord's native codec and sample rate —
  so ffmpeg remuxes rather than transcoding from AAC, and there's no resample.
- Encoding stack is native (`@discordjs/opus` + `sodium-native`), not the slow
  `opusscript` fallback.

## VPS / datacenter IPs need cookies (2026-06-26)

On the Hetzner VPS, playback joined voice but was silent while every other
command worked. `pm2 logs` showed yt-dlp dying with
`ERROR: [youtube] <id>: Sign in to confirm you're not a bot` — YouTube flags
datacenter IPs and refuses to stream without an authenticated session. (It
works from residential/local IPs, which is why it played locally.) The empty
stream makes discord-player log "Now playing" then "Finished" in ~120 ms.

Fix: set **`YT_COOKIES_FILE`** in the VPS `.env` to a Netscape-format
`cookies.txt` from a logged-in (ideally throwaway) YouTube account;
`streamWithYtDlp` passes it to yt-dlp via `--cookies`. Cookies expire (~2 weeks)
and must be refreshed. `YT_COOKIE` (header string, used by the youtubei
metadata extractor) is separate and unrelated to this.

## Maintenance

The bundled yt-dlp binary goes stale (YouTube changes frequently) and
`npm install` may reset it to the pinned version. Keep it current with
`yt-dlp -U` on the bundled binary under `node_modules` (or
`npm run music:update-ytdlp`). Stale yt-dlp and the VPS cookie block above are
the two most likely causes if playback breaks again.

## Open threads

See [open-questions.md](open-questions.md): automating yt-dlp freshness, and
measuring true Opus passthrough (skip ffmpeg re-encode entirely).
