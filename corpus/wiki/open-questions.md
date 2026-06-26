# Open questions

Only genuinely unresolved threads. Delete each the moment it's answered.

- **Keeping yt-dlp fresh automatically.** The bundled binary goes stale and
  `npm install` may reset it. Options: a `postinstall`/`prestart` `yt-dlp -U`,
  a periodic cron, or pinning a newer `youtube-dl-exec`. Not yet decided — see
  [brief 01](../briefs/todo/01-music-audio-quality.md).
- **Opus passthrough viability.** Whether YouTube `bestaudio` is reliably WebM
  Opus at 48 kHz (letting us skip ffmpeg re-encode for lower CPU + better
  quality) or whether the occasional m4a/AAC source forces a transcode anyway.
  Needs measurement against real tracks.
