# Task 26: Jukebox, part 2: voice playback and the link to atrium

## Context

Source: the Jukebox grilling with the owner, 2026-10-08. See the decision "Music
comes from atrium, signed in as the bot's own Ward account" in
[decisions.md](../../wiki/decisions.md) and the Music terms in
[glossary.md](../../wiki/glossary.md). Needs brief 25 (the signed-in atrium
client) and atrium brief 81 (the Jukebox API), deployed or running locally.

The bot becomes a speaker that atrium steers. Atrium owns every **Player**: the
voice channel, the current Track, the position, the **Queue**, shuffle and
repeat. The bot keeps **no Player state of its own**. It holds one long-poll
open for commands, does what they say, reports what it is doing, and asks
atrium what plays next. It still binds no port.

**How to play audio.** Discord's docs describe the voice protocol but not how
to play files. For a discord.js bot, the reference is the discord.js voice
guide (discordjs.guide/voice, read 2026-10-08).
- Use `@discordjs/voice`. It ships `@snazzah/davey` for **DAVE**, Discord's
  end-to-end voice encryption, which every client and bot has had to support
  since 2026-03-01.
- MP3 needs FFmpeg to become Opus. The guide says the cheapest input is **Ogg
  Opus**: the library then skips FFmpeg and the Opus encoder during playback.
  Inline volume turns that saving off, and volume is deferred anyway.
- The owner asked for a buffer of one or two songs on disk, not in RAM.

Put together:
- Each Track is converted once, MP3 to Ogg Opus, with the `ffmpeg` binary.
- Upcoming Tracks are converted ahead of time into a temp directory.
- A cold start (nothing buffered yet) pipes the download through ffmpeg
  straight into the player, so it plays as bytes arrive.
- Either way the player gets `StreamType.OggOpus`. No Opus encoder package is
  needed, which `generateDependencyReport()` should confirm.

**The atrium contract**, restated from atrium brief 81:
- **Paths.** Everything sits under `JUKEBOX_ATRIUM_URL`. Errors are
  `{error: "CODE"}`, and guild ids match `^\d{17,20}$`.
- **`Track`**: `{id, title, artist, album, trackNumber, durationSeconds}`.
  Audio comes from `GET /library/:id/file`, which supports Range requests.
- **`GET /jukebox/bot/commands?after=<cursor>&wait=<s>`** returns
  `{cursor, commands}`. The maximum `wait` is 20, unless brief 81's outcome
  lowered it.
  - Without `after`, it returns the current cursor at once and drops older
    commands. Do that once at boot.
  - With `after`, it answers when a newer command exists, or empty when `wait`
    runs out.
- **Commands** all carry `{id, guildId}`, plus one of:
  - `{kind: "join", channelId}`
  - `{kind: "leave"}`
  - `{kind: "play", playId, track, upcoming}`
  - `{kind: "pause"}`, `{kind: "resume"}`, `{kind: "stop"}`
  - `{kind: "upcoming", upcoming}`
- **`POST /jukebox/bot/status`** takes
  `{guildId, guildName, voiceChannel: {id, name} | null, voiceChannels: [{id, name}], playId, state: "idle" | "playing" | "paused", positionMs}`
  and returns `{upcoming}`. It is also how a Player comes to exist.
- **`POST /jukebox/bot/players/:guildId/advance`** takes
  `{playId, reason: "ended" | "error"}` and returns `{play: {playId, track, upcoming} | null}`.
  A stale `playId` returns `{play: null, stale: true}`. Do nothing then, because
  a newer `play` command is on its way.
- **`POST /jukebox/players/:guildId/control`** takes `{action, ...}`. The bot
  uses it for the empty-channel rule below.
- **The `playId` rule.** Atrium raises `playId` every time a Track starts. Apply
  a `play` only if its `playId` is newer than the one playing. Every status
  report and `advance` carries the current `playId`.

Bot facts, checked 2026-10-08:
- **Intents** are at `index.ts:32-37`: Guilds, GuildMessages, MessageContent,
  DirectMessages. `GuildVoiceStates` was removed as unused by brief 04, and
  comes back now.
- **Ready** handler at :47-52. **Shutdown** at :216-246: SIGINT and SIGTERM, a
  3-second flush window, then `client.destroy()`.
- **Dockerfile.** The prod stage is `node:24-alpine` with no `apk` installs
  (:22). It prunes non-linux prebuilds (:31-33) and runs as root.
- **docker-compose.yml.** No tmpfs, so `os.tmpdir()` is the container's writable
  layer, on disk.
- **Pure logic in its own modules.** This is a convention, not a rule
  ([decisions.md](../../wiki/decisions.md)). Keep the buffer plan and the
  empty-channel timer free of `discord.js` so they can be tested.

## Files you OWN

- `bots/discord/package.json`: `@discordjs/voice`, pinned
- `infrastructure/Dockerfile`: `apk add --no-cache ffmpeg` in the prod stage,
  and whatever keeps `@snazzah/davey`'s musl binary through the prune at :31-33
- `bots/discord/src/index.ts`: the intent, starting the link after ready, and
  voice teardown in the shutdown
- `bots/discord/src/jukebox/` (new, beside brief 25's `atrium/`): `link.ts`,
  `player.ts`, `buffer.ts`, `alone.ts`, and `*.test.ts` for the pure parts

## Files you must NOT touch

- `bots/discord/src/jukebox/atrium/`, apart from using it. If it is missing
  something, add the smallest export and say so in the outcome.
- The commands. Brief 27 owns them.

## What to do

1. **Dependencies and image.**
   - Add `@discordjs/voice` and add ffmpeg to the prod stage.
   - Make sure `@snazzah/davey`'s `linux-x64-musl` binary survives the prebuild
     prune.
   - Add an encryption package only if `generateDependencyReport()` says none is
     available. Node 24 has `aes-256-gcm`.
2. **The link** (`link.ts`). Start it only if `isJukeboxConfigured()` is true.
   - At ready:
     - take the cursor (a call without `after`);
     - wipe `${os.tmpdir()}/jukebox/`;
     - send one status report per guild, idle with no voice channel. That
       registers the Players, and tells atrium about the restart.
   - Then loop on the long-poll and hand each command to that guild's player.
   - On errors, back off from 1 second, doubling to 30. A 403 from brief 25's
     client means the configuration is wrong: log it once and stop the loop.
3. **The player** (`player.ts`), one per guild:
   - **Join:** `joinVoiceChannel` with `selfDeaf: true`, using the guild's
     `voiceAdapterCreator`.
   - **Play:** start the Track, from the buffer if it is ready, or from the live
     pipe if not.
   - **Pause, resume and stop** map to the `AudioPlayer`. **Leave** destroys the
     connection.
   - **Advancing:** when the player goes idle after a Track ends, call `advance`
     with `ended`. A stream or ffmpeg failure calls it with `error`.
     - `{play: null, stale: true}` means a newer `play` command is coming, so wait.
     - `{play: null}` without `stale` means nothing plays next. Go idle and
       report it.
   - **The first `play` after boot always applies**, because the bot has no
     `playId` yet. After that, apply a `play` only if its `playId` is newer.
   - **Status reports:** on every state change, every 10 seconds while playing
     (`positionMs` from the resource's `playbackDuration`), and when a voice
     channel is created, deleted or renamed. `voiceChannels` lists the guild's
     voice channels where the bot may connect and speak.
4. **The buffer** (`buffer.ts`), per guild:
   - **Directory:** `${os.tmpdir()}/jukebox/<guildId>/`.
   - **Prefetch:** keep the current Track plus the first two of `upcoming`.
   - **Conversion:** Node fetches the file through brief 25's client and pipes
     the body into ffmpeg's stdin:
     `-i pipe:0 -vn -c:a libopus -b:a 96k -ar 48000 -ac 2 -f ogg`.
     Write to `<id>.ogg.part`, and rename only on success.
   - **The session cookie never goes on ffmpeg's command line.**
   - **Live pipe:** the same ffmpeg arguments, writing to stdout, fed to
     `createAudioResource(stdout, {inputType: StreamType.OggOpus})`.
   - **Buffered file:** `createReadStream` with the same input type.
   - **Cleanup:** cancel a prefetch that left `upcoming`, and delete a file once
     its Track is done or no longer upcoming. Never hold more than three files
     per guild.
5. **The empty-channel rule** (`alone.ts`).
   - When the bot's voice channel has no members other than bots, call
     `control` with `pause`, then start a 10-minute timer that calls `leave`.
   - If someone joins first, cancel the timer and stay paused.
   - The decision lives in the bot because the voice events arrive there. The
     change still goes through atrium, so the Player keeps one writer.
6. **Shutdown.** Stop the loop, destroy the voice connections, and report idle,
   best effort, inside the existing 3-second window.
7. **Tests** with `node:test`:
   - the buffer plan, meaning which files to keep, fetch, cancel or delete for a
     given current Track and `upcoming`;
   - the empty-channel state machine, with a fake clock;
   - the `playId` ordering of commands.
8. **Triage notes.** Leave in the outcome what brief 27's
   `docs/discord/jukebox/README.md` needs for triage: what the dependency report
   prints, and the log lines for "sign-in failed", "forbidden" and "atrium
   unreachable".

## Acceptance

- `generateDependencyReport()` **run inside the built prod container**, not on
  the laptop, shows `@discordjs/voice`, DAVE, FFmpeg and an encryption method,
  all present. Paste it into the outcome.
- `npm run typecheck` and `npm test` are clean.
- **Live, dev application, dev guild,** against local atrium with briefs 80 and
  81, signed in as `discord-bot-dev`. Drive it with atrium's page (brief 82) or
  with `curl` on brief 81's control routes:
  - **Join:** the bot enters the voice channel.
  - **Cold start:** audible within 2 seconds.
  - **Buffered:** the next Track starts with no gap over 1 second.
  - **Transport:** pause, resume, stop, next and previous all work, and a Track
    that ends advances by itself.
- The temp directory never holds more than three files per guild, and it is
  empty after a restart.
- **Everyone leaves** the channel: the Player pauses. Check the 10-minute leave
  with the timer shortened locally, and don't commit the change.
- **Stop atrium mid-Track:** the buffered Track keeps playing, the link backs
  off, and it recovers when atrium returns.
- **Restart the bot:** atrium shows the Player idle with its Queue intact.
- **SIGTERM** leaves voice cleanly inside the shutdown window.
- **Not verified in production** until the owner deploys:
  `node cli.ts just-a-bot deploy` from `~/projects/vps-deploy`. Say so in the
  outcome.
