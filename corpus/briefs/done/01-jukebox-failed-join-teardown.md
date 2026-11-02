# Task 01: Jukebox: tear down a voice join that times out

## Context

`bots/discord/src/jukebox/speaker.ts:120-153` (`join`) stores `this.connection = connection` and
subscribes the player before `await entersState(connection, VoiceConnectionStatus.Ready,
READY_TIMEOUT_MS)`. When that times out (the bot lacks Connect or Speak in the member's channel, or
the channel is full), nothing destroys the connection, and `connected()` (`:115-118`) keeps
returning the channel because the state is not Destroyed. `GuildPlayer.run('join')`
(`player.ts:100-108`) only logs a warning. From then on `/jukebox play` skips its join,
`start()` passes its `!this.speaker.connected()` check (`player.ts:154`), and the AudioPlayer
auto-pauses with no subscriber: the bot reports "playing" and nobody hears anything. The 20 s wait
also holds the guild's command chain. The Discord path does not apply the Connect+Speak filter that
`voiceChannels()` applies for atrium's page.

Improvement sweep of 2026-10-20 (Jukebox lens), vetted against the code; the ranked report is the owner's "Repo improvement sweep" doc.

## Files you OWN

- `bots/discord/src/jukebox/speaker.ts` (join)
- `bots/discord/src/jukebox/player.ts` (the join error path)
- `bots/discord/src/commands/jukebox.ts` (the permission check)
- tests under `bots/discord/src/jukebox/`

## What to do

1. In `join()`, catch the `entersState` failure: destroy the connection, clear `this.connection`, rethrow.
2. After a failed join, report status with no voice channel, so atrium's page shows "Not in a voice channel".
3. Before joining from Discord, check the bot has Connect and Speak in the member's channel and answer "I can't join that channel" if not.

## Acceptance

- A test with a fake connection that never reaches Ready: after `join()` rejects, `connected()` is null and `destroy()` was called.
- Owner's first run: `/jukebox play` from a channel without Speak gets a clear refusal.

## Outcome (2026-11-02)

Built in `9869574`.

- `DiscordSpeaker.join()` catches the `entersState(Ready)` timeout, clears
  `this.connection` and stops the player, then destroys the connection and
  rethrows "the voice connection was not ready within 20 s". Clearing comes
  first so the Destroyed listener does not also fire `disconnected`; the
  player's join path reports once.
- `GuildPlayer.run('join')` handles a failed join like a disconnect: the
  empty-channel timer is reset, the state goes idle, and the report that
  follows has no voice channel. Both paths share `lostVoice()`.
- `/jukebox play` (when it has to join) and `/jukebox join` refuse with "I
  can't join **channel**. I need Connect and Speak there, and room in the
  channel." unless the member's channel is a voice channel (not a stage) that
  discord.js calls `joinable` (Connect, not full) and `speakable`.
- Also corrected, outside the files the brief owned: `format.ts`'s
  `errorReply` maps atrium's 409 `NOT_IN_VOICE` (skip, previous, resume while
  the bot is in no channel; atrium added it on 2026-10-27) to "I'm not in a
  voice channel. Use `/jukebox join` from yours first." It used to read
  "Atrium refused that (NOT_IN_VOICE)." The docs' Jukebox triage says both.
- For the tests, `DiscordSpeaker` is exported with an injectable
  `joinVoiceChannel` and ready timeout, and `GuildPlayer` takes
  `Pick<TrackBuffer, 'update' | 'open' | 'clear'>`.

Checks: typecheck clean; bot tests 64/64. New: a stuck fake connection
(EventEmitter, real `entersState`, 20 ms timeout) ends with `connected()`
null, `destroy()` called once and `disconnected` not called; a GuildPlayer
playing in one channel that fails to move reports idle with no voice channel,
once; the `NOT_IN_VOICE` reply. The bot was not run.

**Owed by the owner** (first live run): `/jukebox play` from a channel where
the bot lacks Speak gets the refusal; atrium's Join to a full channel ends
with atrium's page showing "Not in a voice channel" after 20 s.
