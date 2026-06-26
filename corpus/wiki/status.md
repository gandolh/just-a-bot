# Status — 2026-06-26

Where things stand right now.

## Music (`/play`)

- **Fixed:** joins-but-silent bug (YouTube SABR/PO-token enforcement). Now
  streams via yt-dlp through a `createStream` override. See [music.md](music.md).
- **Quality (done):** [brief 01](../briefs/done/01-music-audio-quality.md) —
  `volume: 100` (skips PCM volume filter); yt-dlp format
  `bestaudio[acodec=opus]/bestaudio` (WebM/Opus @ 48 kHz, Discord-native); shared
  `getActiveQueue` helper deduping the six control commands; `music:update-ytdlp`
  script.
- **Deferred:** true Opus passthrough (skip ffmpeg re-encode) — needs live voice
  testing. See [open-questions.md](open-questions.md).

## Rest of the bot

Many features in place (games, gambling, AI chat, image gen, reminders, RPG).
Not yet catalogued in the corpus — pages will be added as work touches them.

## Maintenance note

The bundled yt-dlp binary must be kept current (`yt-dlp -U`); `npm install` may
reset it to the pinned version. Stale yt-dlp is a recurring YouTube-breakage
risk.
