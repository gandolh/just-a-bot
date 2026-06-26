# Status — 2026-06-26

Where things stand right now.

## Music (`/play`)

- **Provider model:** SoundCloud = temporary **primary** (active, streams
  natively); YouTube = **disabled secondary** (`YOUTUBE_ENABLED = false`, kept +
  deprecated) because it blocks the VPS IP. Commands stay live on SoundCloud.
  See [music.md](music.md); re-enable YouTube per
  [todo](../todos/revisit-youtube-provider.md).
- **Why YouTube is off (VPS):** datacenter IP gets "Sign in to confirm you're not
  a bot" → silent playback. Worked locally only. The yt-dlp cookies path
  (`YT_COOKIES_FILE`) is wired but unused while YouTube is disabled.
- **Quality (done):** [brief 01](../briefs/done/01-music-audio-quality.md) —
  `volume: 100`; shared `getActiveQueue` helper; `music:update-ytdlp` script.
  (The Opus-format selection applies to the disabled yt-dlp path.)
- **Deferred:** true Opus passthrough — needs live voice testing. See
  [open-questions.md](open-questions.md).

## Rest of the bot

Many features in place (games, gambling, AI chat, image gen, reminders, RPG).
Not yet catalogued in the corpus — pages will be added as work touches them.

## Maintenance note

The bundled yt-dlp binary must be kept current (`yt-dlp -U`); `npm install` may
reset it to the pinned version. Stale yt-dlp is a recurring YouTube-breakage
risk.
