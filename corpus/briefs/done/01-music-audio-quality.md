# Task 01 — Music audio quality + code cleanup

## Context

After fixing the joins-but-silent bug (now streaming via yt-dlp — see
[wiki/music.md](../../wiki/music.md)), the music subsystem has room for both
audio-quality and code-quality improvements. The user asked to capture and
implement worthwhile ones.

Relevant code:
- [player.ts](../../../bots/discord/src/player.ts) — player init + `streamWithYtDlp`
- [commands/play.ts](../../../bots/discord/src/commands/play.ts)
- [commands/{queue,skip,stop,pause,resume,nowplaying}.ts](../../../bots/discord/src/commands/)

## Files you OWN

- `bots/discord/src/player.ts`
- `bots/discord/src/commands/play.ts`
- `bots/discord/src/commands/{queue,skip,stop,pause,resume,nowplaying}.ts`
- a new `bots/discord/src/commands/_music.ts` (shared helper)
- root `package.json` (add a maintenance script only)

## Files you must NOT touch

- Non-music commands and feature dirs.
- `node_modules` (the yt-dlp binary is updated via a script/command, not edited).

## What to do

**Audio quality**

1. **Volume 100** — set `volume: 100` in `play.ts` `nodeOptions` so audio skips
   discord-player's PCM volume filter. _(DONE)_
2. **Opus/48 kHz format selection** — in `streamWithYtDlp`, request
   `bestaudio[acodec=opus]/bestaudio` so yt-dlp yields WebM/Opus @ 48 kHz
   (Discord's native codec + sample rate). Verified: yields `opus webm
   128.93k 48000Hz`. ffmpeg then remuxes instead of transcoding from AAC, and
   there's no resample.

**Code quality**

3. **Shared queue helper** — the six secondary music commands repeat the same
   `inCachedGuild()` guard + `useQueue` + "nothing playing" reply. Extract a
   helper (e.g. `getActiveQueue(interaction)`) into `commands/_music.ts` that
   returns the queue or replies + returns `null`. Refactor the six commands to
   use it. Pure dedupe — behavior unchanged.

**Maintenance**

4. **Keep yt-dlp fresh** — add a root `package.json` script
   (`music:update-ytdlp`) that runs `yt-dlp -U` on the bundled binary, and
   document it in [wiki/music.md](../../wiki/music.md). Do NOT wire it into
   `start` (must not break offline / network-restricted starts).

## Deferred / experimental (do NOT implement blindly)

- **True Opus passthrough** (skip ffmpeg re-encode entirely via
  `StreamType.Opus`/`skipFFmpeg`): the largest CPU + quality lever, but
  discord-player wraps streams in its own pipeline and this needs live voice-
  channel measurement to confirm it works without breaking volume/filters.
  Tracked in [open-questions.md](../../wiki/open-questions.md).

## Acceptance

- `npm run typecheck` clean.
- yt-dlp format string verified to return an Opus/48 kHz stream.
- The six secondary commands no longer duplicate the guard/queue-fetch block;
  behavior (replies, ephemerals) unchanged.
- `music:update-ytdlp` script present and documented; not in the start path.

---

## Outcome — 2026-06-26

Shipped all four non-deferred items:

1. `volume: 100` in [play.ts](../../../bots/discord/src/commands/play.ts).
2. yt-dlp format `bestaudio[acodec=opus]/bestaudio` in `streamWithYtDlp`
   ([player.ts](../../../bots/discord/src/player.ts)) — verified to return
   `opus webm 128.93k 48000Hz`.
3. New [`_music.ts`](../../../bots/discord/src/commands/_music.ts) `getActiveQueue`
   helper; refactored skip/pause/resume/nowplaying/stop/queue to use it. Behavior
   preserved (silent return off-guild, same ephemeral messages).
4. Root `music:update-ytdlp` script (`yt-dlp -U`); not wired into start.

Verified: `npm run typecheck` clean across all workspaces; `music:update-ytdlp`
runs. The true-Opus-passthrough item remains deferred (needs live voice testing).
