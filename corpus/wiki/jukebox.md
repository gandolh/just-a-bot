---
summary: How the bot's Jukebox works (built 2026-10-09, signing in to atrium's own accounts since 2026-10-13) — the local atrium sign-in, the long-poll link to atrium, the per-guild player and disk buffer, the Speaker seam, atrium's status rules the bot must follow, triage log lines, and the live Discord checks still owed. Atrium's side is atrium's corpus/wiki/jukebox.md.
updated: 2026-11-02
---

# Jukebox (bot side)

The bot plays atrium's music in voice channels. Atrium owns every Player (its
D57); the bot is a speaker that atrium steers. Terms are in
[glossary.md](glossary.md); the call is in [decisions.md](decisions.md) ("Music
comes from atrium"). Code: `bots/discord/src/jukebox/`.

## Pieces

- **`atrium/`**: logs in to atrium as the Bot account with
  `POST /auth/login` and calls it with the `atrium_session` cookie, kept in
  memory only. A 401 logs in again once (single-flight) and retries; a renewed
  `Set-Cookie` replaces the kept one; a refused password is tried once only
  (atrium's five-failure lockout). `session.ts` holds the session, `request.ts`
  the client, `client.ts` the singleton. Errors are
  typed: `NotConfigured`, `SignInFailed`, `Forbidden` stop; `Unavailable`
  retries; `RequestError` carries atrium's `{error}` code.
- **`link.ts`**: takes the command cursor **once**, reports each guild idle,
  then holds `GET /jukebox/bot/commands?wait=20` open (30 s timeout). Backs off
  1 s doubling to 30 s; stops for good on a permanent error. Reports status on
  every change and every 10 s while playing.
- **`player.ts`**: one per guild. Commands run in order, so a `play` after a
  `join` waits for the connection. Applies a `play` only if its `playId` is newer
  (the first after boot always). When a Track ends it asks `advance`; if atrium
  is down it retries with backoff, outside the command chain, and drops the
  retry once a newer play, a stop or a leave arrives.
- **`buffer.ts`**: per guild in `$TMPDIR/jukebox/<guildId>/`. ffmpeg converts
  each MP3 to Ogg Opus once (`-c:a libopus -b:a 96k -ar 48000 -ac 2 -f ogg`),
  fed through stdin so the session cookie never reaches its command line. Keeps
  the current Track and the next two, never more than three files. A Track not
  yet buffered plays from a live pipe. Wiped at boot, cleared at shutdown.
- **`alone.ts`**: nobody but bots in the channel → `control: pause`, then
  `leave` after 10 minutes; someone returning cancels the leave and stays
  paused. Both go through atrium, so the Player keeps one writer.
- **`speaker.ts`**: the voice side behind a `Speaker` interface.
  `DiscordSpeaker` wraps `@discordjs/voice` (self-deafened, `StreamType.OggOpus`,
  no Opus encoder needed); `discordHost(client)` routes voice-state and channel
  events. The link and player see only the interface, which is how they were
  run against atrium without Discord.

## Atrium's rules

Atrium's status rules as built (atrium's Jukebox page, 2026-10-09; atrium's
`jukebox.md` has the why):
- A poll **without `after`** tells atrium the bot restarted: every playing or
  paused Player goes idle, its Queue kept. So the cursor is taken once, at
  ready, and a reconnect keeps the one it has.
- A status report carries state and position only for the **current
  `playId`**, and only while atrium has not stopped that play. A report about an
  older play changes just voice and liveness.
- **No voice channel on the current `playId`** means lost voice: atrium idles
  the Player. A `play` that arrives with no voice connection is reported idle
  with that `playId`, which is how it ends.
- `advance` with an old `playId` answers `stale` (a newer `play` is coming); on
  a Player already idle it answers `{play: null}`.
- The long-poll's maximum `wait` is 20 s, held through atrium's dev proxy and
  container on 2026-10-08.

## Triage

A healthy image's `generateDependencyReport()` (2026-10-09) shows
`@discordjs/voice` 0.19.2, prism-media 1.3.5, native `aes-256-gcm`,
`@snazzah/davey` 0.1.12 and FFmpeg 8.1.2 with libopus. "Opus Libraries: not
found" is expected. Log lines, all scope `[jukebox]`:
- Not configured: `Jukebox not configured (no JUKEBOX_* variables); the link is off`.
- Old variables: `JUKEBOX_WARD_… no longer read (brief 29)`: not renamed yet.
- Sign-in failed: `Jukebox sign-in failed: atrium refused the sign-in for
  JUKEBOX_ATRIUM_USERNAME=… (401 invalid_credentials)…`, then `Jukebox link
  stopped`. Nothing retries until a restart.
- Forbidden: `Jukebox link stopped: atrium refused the Bot account
  (JUKEBOX_ROLE_FORBIDDEN); check its atrium user has the jukebox role`.
- Atrium unreachable: `atrium unreachable while waiting for commands (…)`,
  `Jukebox link retrying in N s`, then `Jukebox link back`. Behind the dev
  proxy a stopped atrium shows as "answered 500".
- Each Track: `playing "<title>" in <guild> (live|buffered)`.

`npm run discord:jukebox-check` tests the sign-in on its own. Its session is in
memory, so it can run beside the bot.

## The command

`/jukebox` (`commands/jukebox.ts`) is the second remote; atrium's
page is the first. Every subcommand calls atrium and changes nothing locally.
Each call gets 2.5 s; a reply pending at 1.5 s is deferred ephemerally, so
errors stay ephemeral and controls still answer publicly. Reply text and the
autocomplete filter are in `jukebox/format.ts`.

## Owed: hearing it in Discord

Not run yet. The deploy pushes the local `bots/discord/.env` when there is one,
so production's token must never be used for a local run (none is on this
machine since 2026-11-01). With a dev application, a dev guild, `npm run
discord:register` and `npm run discord:dev` against the local atrium:
- Join puts the bot in the channel; a cold start is audible within 2 s; a
  buffered next Track starts with no gap over 1 s.
- Pause, resume, stop, next and previous are heard; a Track that ends advances.
- Everyone leaves → the Player pauses. Shorten `LEAVE_AFTER_MS` locally to see
  the leave, and don't commit that.
- SIGTERM leaves the channel visibly.
- Every `/jukebox` subcommand, a song added from Discord showing on atrium's
  page with the Discord name, and `/help` listing it under Music.
- Production: deploy with `node cli.ts just-a-bot deploy` from
  `vps-deploy` once atrium's Jukebox and its own accounts are deployed and
  its `jukebox` user is seeded (the owner's steps are in the 2026-10-13 log
  entry). The deploy registers the slash commands.

## Before 2026-10-13: the Ward sign-in

From 2026-10-09 the Bot account was a Ward account (`discord-bot`), with a
password login and Ward's rotating refresh token saved in
`data/jukebox-session.json`. Atrium stopped reading Ward's cookie on
2026-10-13, so the bot moved to atrium's own login; the spent file is deleted
at boot. Two Ward facts seen live on 2026-10-08, in case anything signs in to
Ward this way again: `accessTokenExpiresAt` comes as epoch **seconds** and
`refreshTokenExpiresAt` as an ISO string, and a rotated refresh token used
twice (two processes sharing the file) gets the session revoked. The
not-before time after a 429 or a network failure survives in today's
`session.ts`.
