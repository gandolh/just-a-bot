# Task 33: Jukebox: make sure slow replies stay visible (first-run check)

## Context

`commands/jukebox.ts:135-151`: when atrium takes more than 1.5 s, `answer()` defers with
`ephemeral: true`; for a public result it then calls `followUp()` without `ephemeral` and
`deleteReply()`. In Discord's interaction model the first follow-up after a deferral can fill the
deferred placeholder and inherit its ephemeral flag, in which case `deleteReply()` removes the only
message and "Skipped." or "Added … to the queue" is never seen. Unverified: the Jukebox has never
run in Discord.

Improvement sweep of 2026-10-20 (Jukebox lens), vetted against the code; the ranked report is the owner's "Repo improvement sweep" doc.

## Files you OWN

- `bots/discord/src/commands/jukebox.ts` (the slow path of `answer`)

## What to do

1. On the first live run, delay atrium (stop it briefly) and run `/jukebox skip`: does a public confirmation remain?
2. If not, decide visibility before deferring (defer publicly when the answer will be public, then `editReply`), or post the public message to the channel and edit the ephemeral reply.

## Acceptance

- With atrium answering after more than 1.5 s, another member sees the confirmation.
