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
(`https://gandolh.ro/atrium/jukebox`), where anyone signed in can also upload
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

1. **A Ward account for the bot.** In Ward's console
   (`https://gandolh.ro/ward/`, as superuser), create an account such as
   `discord-bot` with a long generated password, and grant it `atrium` with the
   role `jukebox` and nothing else. That role limits the account to the Jukebox
   and the song files: it cannot see the rest of the library, notes or
   profiles, and cannot delete anything. A local dev bot gets its own account
   (`discord-bot-dev` on the local Ward container); two processes must never
   share one.
2. **Four variables** in `bots/discord/.env`, all four or none:

   ```
   JUKEBOX_ATRIUM_URL=https://gandolh.ro/atrium-api
   JUKEBOX_WARD_URL=https://gandolh.ro/ward-api
   JUKEBOX_WARD_USERNAME=discord-bot
   JUKEBOX_WARD_PASSWORD=...
   ```

   With none set, `/jukebox` answers "The Jukebox isn't set up on this bot" and
   the rest of the bot runs as usual. A partial set stops the bot at boot and
   names what is missing. The deploy pushes this file to the server as it is,
   so it holds the production values; see [setup](../setup.md) for a local run.
3. **Check** without starting the bot: `npm run discord:jukebox-check`. It signs
   in, refreshes, and expects atrium's `/health` to answer 200 and `/library`
   to answer 403 `JUKEBOX_ROLE_FORBIDDEN` (the role doing its job). Run it with
   the bot stopped.
4. **Register** the command with `npm run discord:register` (the production
   deploy does this).

The bot's image includes `ffmpeg`, which converts each song to Ogg Opus once.

## State

| Path | What |
| --- | --- |
| `bots/discord/data/jukebox-session.json` | The account's Ward refresh token, so a restart resumes without a new sign-in. Delete it to force one. |
| `$TMPDIR/jukebox/<guild-id>/` | The current song and the next two, as Ogg Opus. Never more than three files per server; emptied at every start. |

Everything else (queue, history, shuffle, repeat) lives in atrium.

## Triage

All log lines carry the `[jukebox]` scope.

- **Is the voice stack whole?** Inside the container:
  `node -e "import('@discordjs/voice').then(m => console.log(m.generateDependencyReport()))"`
  from `/app/bots/discord`. A healthy image shows `@discordjs/voice`,
  `@snazzah/davey` (DAVE, Discord's voice encryption), FFmpeg with
  `libopus: yes`, and `native crypto support for aes-256-gcm: yes`.
  "Opus Libraries: not found" is expected: songs arrive already in Opus.
- **"Can't sign in to atrium."** Look for `Jukebox sign-in failed: Ward refused
  the sign-in for JUKEBOX_WARD_USERNAME=…`. The username or password is wrong,
  or the account is disabled. The bot tries a refused password once and then
  stops trying, so it cannot lock the account out; fix `.env` and restart.
- **Same reply, but `Jukebox link stopped: atrium refused the Bot account
  (NO_ATRIUM_GRANT or JUKEBOX_ROLE_FORBIDDEN)`.** The account signs in but its
  grant is wrong. It must be exactly `atrium` with role `jukebox`. A changed
  grant takes up to 30 seconds to reach atrium; restart the bot after fixing it.
- **"Atrium is unreachable right now."** Look for `atrium unreachable while
  waiting for commands` and `Jukebox link retrying in N s`. The bot backs off
  up to 30 seconds and logs `Jukebox link back` when atrium answers again. A
  song already buffered keeps playing meanwhile.
- **"The player is offline."** Atrium has not heard from the bot for 30
  seconds: the bot is down, or its link stopped (see the two lines above).
- **The bot doesn't join.** It needs the Connect and Speak permissions in that
  channel; only channels where it has both are offered on atrium's page. The
  log says `joining voice in <guild> failed: …`. Every song it starts logs
  `playing "<title>" in <guild> (live|buffered)`.
