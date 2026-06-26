# Music subsystem (`/play`)

The Discord bot's music stack. Code lives in
[player.ts](../../bots/discord/src/player.ts) and the music commands under
[commands/](../../bots/discord/src/commands/) (`play`, `queue`, `skip`, `stop`,
`pause`, `resume`, `nowplaying`).

## Stack

- **discord-player 7.2.0** — queue/player orchestration (`Player` singleton).
- **discord-player-youtubei (3.0.0-beta.4)** — YouTube **metadata + search**
  extractor (registered with priority 100).
- **@discord-player/extractor 7.2.0** — fallback extractors (Spotify/SoundCloud
  metadata, etc.), loaded via `DefaultExtractors`.
- **@discordjs/voice 0.19.2 + @discordjs/opus + sodium-native** — voice
  transport + Opus encoding + encryption (native, no slow `opusscript` path).
- **ffmpeg-static** — audio transcode/remux.
- **youtube-dl-exec (yt-dlp)** — the actual **audio stream** source.

## How a `/play` flows

1. [play.ts](../../bots/discord/src/commands/play.ts) validates the user is in a
   voice channel, then calls `player.play(channel, query, { searchEngine:
   YOUTUBE_SEARCH, nodeOptions })`.
2. discord-player-youtubei resolves the query → a `Track` (metadata only).
3. To stream, discord-player calls our **`createStream` override** in
   [player.ts](../../bots/discord/src/player.ts) (`streamWithYtDlp`), which runs
   yt-dlp (`output: '-'`) and returns the stdout `Readable`.
4. discord-player pipes that through ffmpeg → Opus → `@discordjs/voice`.

`nodeOptions`: `leaveOnEnd`/`leaveOnEmpty` (60 s cooldown), `selfDeaf: true`,
`volume: 100`.

## Why we stream via yt-dlp (the big decision)

YouTube enforces **SABR streaming + PO tokens** on its WEB/MWEB innertube
clients. The youtubei.js stream cascade inside discord-player-youtubei
(ANDROID_VR → MWEB → WEB_EMBEDDED → SABR → yt-dlp) became unreliable: metadata
still resolves (so a track "queues"), but the chosen stream can pass a HEAD
check yet deliver **no audio** — the bot joins voice and sits silent. yt-dlp
still extracts a working audio stream, so we bypass the cascade with a
`createStream` override. Fixed 2026-06-26 — see [log.md](../log.md).

## Audio quality

- **`volume: 100`** in `nodeOptions` — any value ≠ 100 routes audio through
  discord-player's software PCM volume filter, which resamples and degrades
  quality. 100 skips it.
- **Format selection:** yt-dlp requests `bestaudio[acodec=opus]/bestaudio`,
  which yields **WebM/Opus @ 48 kHz** — Discord's native codec and sample rate —
  so ffmpeg remuxes rather than transcoding from AAC, and there's no resample.
- Encoding stack is native (`@discordjs/opus` + `sodium-native`), not the slow
  `opusscript` fallback.

## Maintenance

The bundled yt-dlp binary goes stale (YouTube changes frequently) and
`npm install` may reset it to the pinned version. Keep it current with
`yt-dlp -U` on `node_modules/youtube-dl-exec/bin/yt-dlp`. Stale yt-dlp is the
most likely cause if playback breaks again.

## Open threads

See [open-questions.md](open-questions.md): automating yt-dlp freshness, and
measuring true Opus passthrough (skip ffmpeg re-encode entirely).
