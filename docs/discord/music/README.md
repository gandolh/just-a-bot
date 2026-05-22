# Music

> ⚠️ **Experimental — may break.** The music commands are wired up and
> functional in good conditions, but they depend on YouTube extractors that
> drift with upstream API changes. Treat as unsupported until further
> notice.

## Status

The bot ships `/play`, `/skip`, `/pause`, `/resume`, `/stop`, `/queue`,
`/nowplaying`. They use [discord-player](https://discord-player.js.org/) v7
with the [`discord-player-youtubei`](https://github.com/retrouser955/discord-player-youtubei)
extractor. ffmpeg ships via `ffmpeg-static`.

## Extractor config

We pin `discord-player-youtubei@3.0.0-beta.4` because the 2.x line ships
`youtubei.js@16`, which can no longer extract YouTube's signature /
n-decipher functions (look for `Failed to extract signature decipher
function` + `No valid URL to decipher` in logs — that's the 2.x failure
mode). The 3.x beta bumps to `youtubei.js@17` which has the fixes.

The 3.x API surface is much smaller than 2.x: the export was renamed
`YoutubeiExtractor` → `YoutubeExtractor`, and PoToken handling, `useClient`,
and `streamOptions` all moved internal. Effectively the only options worth
passing are `cookie` and `proxy`.

`bots/discord/src/player.ts` registers `YoutubeExtractor` with:

- `cookie` (optional) — read from the `YT_COOKIE` env var. Strongly
  recommended on cloud hosts, where unauthenticated YouTube requests get
  rate-limited or blocked outright.

### Setting `YT_COOKIE`

1. Log into a **throwaway** Google account in a browser (never your real
   one — YouTube can shadow-ban accounts used for bot scraping).
2. DevTools → Application → Cookies → `https://www.youtube.com` → copy
   the full `Cookie:` header value.
3. Add to `bots/discord/.env`:
   ```
   YT_COOKIE="VISITOR_INFO1_LIVE=...; YSC=...; PREF=...; SID=...; ..."
   ```
4. Cookies expire in weeks/months. If music breaks again with no code
   change, refresh the cookie first.

OAuth (`npx discord-player-youtubei`) is documented as broken upstream;
use cookies.

Things that have broken in the past and will likely break again:

- YouTube extractor token/auth changes
- Region/age-gated tracks
- Rate-limit responses pretending to be other errors
- Voice connection drops on long sessions

When it works it's fine. When it doesn't, check the bot logs (the player
emits `playerError` and `debug` events that we forward to the scoped
logger).

### Triage when `/play` stops working

1. `playerSkip … reason: LOAD_FAILED` or `Sign in to confirm you're not a
   bot` → set/refresh `YT_COOKIE`.
2. Bot joins the channel but no audio + no `playerStart` event → PoToken
   generation failing internally. Confirm the host can reach
   `https://www.youtube.com` (PoToken bootstrap does an HTTP fetch).
3. Bot doesn't join the channel at all → voice/opus issue, not extractor.
   Check `@discordjs/opus` built natively for the host arch.
4. Worked yesterday, broke today, no code change → YouTube shipped a
   breaking change. Bump `discord-player-youtubei` to latest; the
   maintainer usually ships a fix within days.

## Why this is gated as experimental

A robust music bot is its own project. Until I'm ready to babysit the
upstream churn, it stays in the "use at your own risk" tier and doesn't
get full docs.

Source: [`bots/discord/src/player.ts`](../../../bots/discord/src/player.ts) +
the `commands/play.ts`, `skip.ts`, `pause.ts`, `resume.ts`, `stop.ts`,
`queue.ts`, `nowplaying.ts` files.
