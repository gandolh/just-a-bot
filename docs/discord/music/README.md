# Music

> 🛑 **Shelved as of 2026-06-26 — the commands are not live.** All seven music
> commands are commented out of `bots/discord/src/commands/index.ts`, so they do
> not appear in Discord. The code is intact and re-enabling is mostly
> uncommenting. **Why it was shelved, and the current provider setup, live in
> [corpus/wiki/music.md](../../../corpus/wiki/music.md)** — that page is
> authoritative for behavior; this one is the operating/setup runbook.

## What ships (when re-enabled)

`/play`, `/skip`, `/pause`, `/resume`, `/stop`, `/queue`, `/nowplaying`, built on
[discord-player](https://discord-player.js.org/) v7. ffmpeg ships via
`ffmpeg-static`. The `Player` is constructed with `skipFFmpeg: false` — this is
**required**, not a tuning choice; without it the raw stream reaches the Opus
packetizer undecoded and every track plays ~120 ms of silence then "finishes".

Two providers, only one active:

- **SoundCloud — primary.** From `@discord-player/extractor`'s
  `DefaultExtractors`, with `SoundCloudExtractor.priority = 100`; `/play`
  searches via `QueryType.SOUNDCLOUD_SEARCH`. Streams natively — no auth, no
  yt-dlp, not IP-blocked on the VPS. Trade-off: smaller catalog, and
  non-freely-streamable tracks return a 0:30 preview.
- **YouTube — disabled.** Gated behind `YOUTUBE_ENABLED = false` in
  `bots/discord/src/player.ts` and marked `@deprecated`, because YouTube blocks
  the VPS datacenter IP ("Sign in to confirm you're not a bot"). Everything in
  the YouTube sections below applies only if you flip that flag.

## Re-enabling

1. Get a source that actually streams from the VPS — see the resume plan in
   [corpus/todos/reenable-music.md](../../../corpus/todos/reenable-music.md).
   Likely endgame: Lavalink, or YouTube via a residential proxy.
2. Uncomment the music commands in `bots/discord/src/commands/index.ts`.
3. `npm run discord:register` to re-publish the slash commands.
4. Test in a real voice channel — a silent-but-connected bot is the failure mode
   these providers produce, and it does not show up in a typecheck.

## YouTube provider (disabled — reference only)

We pin `discord-player-youtubei@3.0.0-beta.4` because the 2.x line ships
`youtubei.js@16`, which can no longer extract YouTube's signature / n-decipher
functions (`Failed to extract signature decipher function` + `No valid URL to
decipher` in logs is the 2.x failure mode). The 3.x beta bumps to
`youtubei.js@17`, which has the fixes.

The 3.x API surface is much smaller than 2.x: the export was renamed
`YoutubeiExtractor` → `YoutubeExtractor`, and PoToken handling, `useClient`, and
`streamOptions` all moved internal. Effectively the only options worth passing
are `cookie` and `proxy`.

Because YouTube's own stream cascade (SABR + PO tokens) yielded no audio,
`player.ts` also carries a `createStream` override — `streamWithYtDlp` — that
streams via `youtube-dl-exec` (yt-dlp) directly, requesting
`bestaudio[acodec=opus]/bestaudio`.

### Two different cookie env vars

They are not interchangeable:

- **`YT_COOKIE`** — a full `Cookie:` header string, passed to the youtubei
  metadata extractor.
- **`YT_COOKIES_FILE`** — a path to a Netscape-format `cookies.txt`, passed to
  yt-dlp as `--cookies`. This is the one that matters for *streaming* from a
  datacenter IP.

To set either: log into a **throwaway** Google account (never your real one —
YouTube shadow-bans accounts used for bot scraping), then either copy the
`Cookie:` header from DevTools → Application → Cookies → `https://www.youtube.com`
(for `YT_COOKIE`), or export `cookies.txt` with a browser extension (for
`YT_COOKIES_FILE`). Add to `bots/discord/.env`. Cookies expire in ~2 weeks and
must be refreshed by hand — which is exactly why this is not the standing fix.

OAuth (`npx discord-player-youtubei`) is documented as broken upstream.

### Keeping yt-dlp fresh

The bundled binary goes stale as YouTube changes, and `npm install` may reset it
to the pinned version. Update with `npm run music:update-ytdlp`. Automating this
is still an open question — see
[corpus/wiki/open-questions.md](../../../corpus/wiki/open-questions.md).

## Triage when playback breaks

1. **Joins the channel, then silence, `playbackDuration: 120` + immediate
   `Finished`** → an empty or undecodable stream. Check `skipFFmpeg: false` is
   still set; on SoundCloud, check the track isn't a 0:30 preview.
2. **`Sign in to confirm you're not a bot` in `pm2 logs`** → YouTube is blocking
   the host IP. Set/refresh `YT_COOKIES_FILE`, or stay on SoundCloud.
3. **`playerSkip … reason: LOAD_FAILED`** → extractor could not resolve the
   query. Region/age-gated track, or upstream drift.
4. **Doesn't join the channel at all** → voice/opus, not the extractor. Check
   `@discordjs/opus` built natively for the host arch.
5. **Every command silent, not just music** → check whether two instances share
   the token (see the root `CLAUDE.md`), not the player.
6. **Worked yesterday, broke today, no code change** → upstream shipped a
   breaking change. `pm2 logs` first, always.

## Why it stays in the risky tier

A robust music bot is its own project, and every provider so far has been either
IP-blocked, auth-gated, or preview-limited from a datacenter. Until that changes
it stays shelved rather than shipping visibly broken. Full history:
[corpus/log.md](../../../corpus/log.md).

Source: [`bots/discord/src/player.ts`](../../../bots/discord/src/player.ts) plus
`commands/play.ts`, `skip.ts`, `pause.ts`, `resume.ts`, `stop.ts`, `queue.ts`,
`nowplaying.ts` and the shared `commands/_music.ts` helper.
