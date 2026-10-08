---
summary: How the bot's Jukebox works (briefs 25-27) — the Ward sign-in, the long-poll link to atrium, the per-guild player and disk buffer, the Speaker seam, atrium's status rules the bot must follow, triage log lines, and the live Discord checks still owed. Atrium's side is atrium's corpus/wiki/jukebox.md.
updated: 2026-10-09
---

# Jukebox (bot side)

The bot plays atrium's music in voice channels. Atrium owns every Player (its
D57); the bot is a speaker that atrium steers. Terms are in
[glossary.md](glossary.md); the call is in [decisions.md](decisions.md) ("Music
comes from atrium"). Code: `bots/discord/src/jukebox/`.

## Pieces

- **`atrium/`** (brief 25): signs in to Ward as the Bot account without a
  browser and calls atrium. The refresh token is saved to
  `data/jukebox-session.json` before the access token it bought is used, and a
  refused password is tried once only (Ward's five-slot lockout). Errors are
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

Atrium's status rules as built (atrium brief 82; atrium's `jukebox.md` has the
why):
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
- Sign-in failed: `Jukebox sign-in failed: Ward refused the sign-in for
  JUKEBOX_WARD_USERNAME=… (401 invalid_credentials)…`, then `Jukebox link
  stopped`. Nothing retries until a restart.
- Forbidden: `Jukebox link stopped: atrium refused the Bot account
  (JUKEBOX_ROLE_FORBIDDEN); check its Ward grant is atrium:jukebox`.
- Atrium unreachable: `atrium unreachable while waiting for commands (…)`,
  `Jukebox link retrying in N s`, then `Jukebox link back`. Behind the dev
  proxy a stopped atrium shows as "answered 500".
- Each Track: `playing "<title>" in <guild> (live|buffered)`.

`npm run discord:jukebox-check` tests the sign-in on its own; run it with the
bot stopped, since both use the saved session.

## Owed: hearing it in Discord

Not run yet, because the local token could be production's. With the dev
application, a dev guild, `npm run discord:dev` and the local atrium:
- Join puts the bot in the channel; a cold start is audible within 2 s; a
  buffered next Track starts with no gap over 1 s.
- Pause, resume, stop, next and previous are heard; a Track that ends advances.
- Everyone leaves → the Player pauses. Shorten `LEAVE_AFTER_MS` locally to see
  the leave, and don't commit that.
- SIGTERM leaves the channel visibly.
- Production: deploy with `node cli.ts just-a-bot deploy` from
  `~/projects/vps-deploy` once atrium has briefs 80 to 82 and the `discord-bot`
  account exists.
