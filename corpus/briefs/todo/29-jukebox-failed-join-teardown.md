# Task 29: Jukebox: tear down a voice join that times out

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
