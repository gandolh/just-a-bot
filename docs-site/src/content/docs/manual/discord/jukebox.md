---
title: "Jukebox"
tableOfContents:
  maxHeadingLevel: 3
---

:::note[Rendered from `docs/discord/jukebox/README.md`]
Generated on every docs build. Edit the source in `docs/`, not here.
:::
The bot plays music from **atrium**, the owner's media app, in a Discord voice
channel. The songs are atrium's music library, and atrium keeps the state:
what is playing, the queue, shuffle and repeat. There are two remotes for the
same player: `/jukebox` here, and the Jukebox page in atrium
(`/atrium/jukebox`), where anyone signed in can also upload
and delete songs. Anyone in the server may use `/jukebox`. The bot never posts
on its own; ask it with `/jukebox nowplaying`.

## Command surface

| Subcommand | Effect |
| --- | --- |
| `/jukebox play track:<song> [next:true]` | Add a song to the queue (at the end, or next). Autocompletes on title, artist and album. If the bot is in no voice channel it joins yours first; if nothing is playing it starts. |
| `/jukebox skip` | The next song: the queue first, then the playlist. |
| `/jukebox previous` | The previous song. |
| `/jukebox pause` · `/jukebox resume` | Pause and resume. |
| `/jukebox stop` | Stop. The queue and the voice channel stay. |
| `/jukebox join` · `/jukebox leave` | Bring the bot into your voice channel, or send it out. |
| `/jukebox shuffle on:<true/false>` | Shuffle the playlist (the queue always plays in order). |
| `/jukebox repeat mode:<off/one song/the playlist>` | Repeat nothing, the current song, or the whole playlist. |
| `/jukebox nowplaying` | Title, artist, album, and elapsed over total time. Only you see it. |
| `/jukebox queue` | What is playing and the first 10 queued songs, with who added each. Only you see it. |

Controls answer publicly ("Skipped.", "Added *Song* to the queue."). Lookups and
every error answer only you.

When everybody but bots leaves the voice channel, the bot pauses, and it
leaves if nobody comes back within 10 minutes. Someone who returns presses play.

## Setup

1. **A user for the bot in atrium.** Atrium has its own accounts, so this is
   not a Ward account. Seed a user such as `discord-bot` in atrium with a long
   generated password and the role `jukebox` and nothing else. That role limits
   the user to the Jukebox and the song files: it cannot see the rest of the
   library, notes or profiles, and cannot delete anything. A local dev bot
   gets its own user (`discord-bot-dev`).
2. **Three variables** in `bots/discord/.env`, all three or none:

   ```
   JUKEBOX_ATRIUM_URL=https://example.com/atrium-api
   JUKEBOX_ATRIUM_USERNAME=discord-bot
   JUKEBOX_ATRIUM_PASSWORD=...
   ```

   The bot logs in with these when it first needs atrium, keeps atrium's
   session cookie in memory, and logs in again if atrium says the session has
   ended. The old `JUKEBOX_WARD_*` variables are no longer read; the bot logs a
   warning at boot if they are still set.

   With none set, `/jukebox` answers "The Jukebox isn't set up on this bot" and
   the rest of the bot runs as usual. A partial set stops the bot at boot and
   names what is missing. The deploy pushes this file to the server as it is,
   so it holds the production values; see [setup](../setup.md) for a local run.
3. **Check** without starting the bot: `npm run discord:jukebox-check`. It logs
   in, expects atrium's `/health` to answer 200 (also after dropping the
   session, which makes it log in again) and `/library` to answer 403
   `JUKEBOX_ROLE_FORBIDDEN` (the role doing its job), then logs out. Its
   session is its own, so it can run beside the bot.
4. **Register** the command with `npm run discord:register` (the production
   deploy does this).

The bot's image includes `ffmpeg`, which converts each song to Ogg Opus once.

## State

| Path | What |
| --- | --- |
| `$TMPDIR/jukebox/<guild-id>/` | The current song and the next two, as Ogg Opus. Never more than three files per server; emptied at every start. |

Everything else (queue, history, shuffle, repeat) lives in atrium. The bot's
login session is held in memory only, so a restart costs one login. An old
`bots/discord/data/jukebox-session.json` from Ward days is deleted at start.

## Triage

All log lines carry the `[jukebox]` scope.

- **Is the voice stack whole?** Inside the container:
  `node -e "import('@discordjs/voice').then(m => console.log(m.generateDependencyReport()))"`
  from `/app/bots/discord`. A healthy image shows `@discordjs/voice`,
  `@snazzah/davey` (DAVE, Discord's voice encryption), FFmpeg with
  `libopus: yes`, and `native crypto support for aes-256-gcm: yes`.
  "Opus Libraries: not found" is expected: songs arrive already in Opus.
- **"Can't sign in to atrium."** Look for `Jukebox sign-in failed: atrium
  refused the sign-in for JUKEBOX_ATRIUM_USERNAME=…`. The username or password
  is wrong. The bot tries a refused password once and then stops trying, so it
  cannot lock the address out; fix `.env` and restart.
- **Nothing happens and the log says `JUKEBOX_WARD_… no longer read`.** The
  variables were not renamed. Rename them to the `JUKEBOX_ATRIUM_*` names above
  and restart.
- **Same reply, but `Jukebox link stopped: atrium refused the Bot account
  (JUKEBOX_ROLE_FORBIDDEN)`.** The user signs in but has the wrong role. It
  must have `jukebox` and nothing else; fix it in atrium and restart the bot.
- **"Atrium is unreachable right now."** Look for `atrium unreachable while
  waiting for commands` and `Jukebox link retrying in N s`. The bot backs off
  up to 30 seconds and logs `Jukebox link back` when atrium answers again. A
  song already buffered keeps playing meanwhile. If sign-ins are rate-limited
  the bot waits out atrium's `retryAfterSeconds` and says so.
- **"The player is offline."** Atrium has not heard from the bot for 30
  seconds: the bot is down, or its link stopped (see the two lines above).
- **The bot doesn't join.** It needs the Connect and Speak permissions in that
  channel; only channels where it has both are offered on atrium's page. The
  log says `joining voice in <guild> failed: …`. Every song it starts logs
  `playing "<title>" in <guild> (live|buffered)`.
