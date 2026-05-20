# Music

> ⚠️ **Experimental — may break.** The music commands are wired up and
> functional in good conditions, but they depend on YouTube extractors that
> drift with upstream API changes. Treat as unsupported until further
> notice.

## Status

The bot ships `/play`, `/skip`, `/pause`, `/resume`, `/stop`, `/queue`,
`/nowplaying`. They use [discord-player](https://discord-player.js.org/) v7
with the [`discord-player-youtubei`](https://github.com/retrouser955/discord-player-youtubei)
extractor and `yt-dlp` as fallback. ffmpeg ships via `ffmpeg-static`.

Things that have broken in the past and will likely break again:

- YouTube extractor token/auth changes
- Region/age-gated tracks
- Rate-limit responses pretending to be other errors
- Voice connection drops on long sessions

When it works it's fine. When it doesn't, check the bot logs (the player
emits `playerError` and `debug` events that we forward to the scoped
logger).

## Why this is gated as experimental

A robust music bot is its own project. Until I'm ready to babysit the
upstream churn, it stays in the "use at your own risk" tier and doesn't
get full docs.

Source: [`bots/discord/src/player.ts`](../../bots/discord/src/player.ts) +
the `commands/play.ts`, `skip.ts`, `pause.ts`, `resume.ts`, `stop.ts`,
`queue.ts`, `nowplaying.ts` files.
