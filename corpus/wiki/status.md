# Status — 2026-06-26

Where things stand right now.

## Music (`/play`) — SHELVED

- **Disabled.** The music commands (play/skip/pause/resume/stop/queue/nowplaying)
  are **commented out** of [commands/index.ts](../../bots/discord/src/commands/index.ts)
  so they don't appear in Discord. No VPS-viable audio source: YouTube IP-blocked,
  yt-dlp same, SoundCloud returns previews/empty streams (all join voice then play
  ~120 ms and finish). Full resume plan + history:
  [reenable-music.md](../todos/reenable-music.md).
- **Code kept intact:** SoundCloud-primary + `skipFFmpeg:false` in
  [player.ts](../../bots/discord/src/player.ts), YouTube disabled behind
  `YOUTUBE_ENABLED`, yt-dlp cookies wired (`YT_COOKIES_FILE`),
  `music:update-ytdlp` script, brief 01 quality work. Re-enabling is mostly
  uncommenting once a source streams from the VPS.
- **Likely endgame:** Lavalink, or YouTube via residential proxy. See the todo.

## Rest of the bot

Many features in place (games, gambling, AI chat, image gen, reminders, RPG).
Not yet catalogued in the corpus — pages will be added as work touches them.

## Maintenance note

The bundled yt-dlp binary must be kept current (`yt-dlp -U`); `npm install` may
reset it to the pinned version. Stale yt-dlp is a recurring YouTube-breakage
risk.
