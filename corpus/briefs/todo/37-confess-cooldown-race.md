# Task 37: `/confess`: set the cooldown before the first await

## Context

`commands/confess.ts:93` reads the 60 s cooldown, and `:169` sets it only after `loadStore`,
`channels.fetch`, `addConfession` (an fsynced write) and the send. Several submissions fired at
once (a double Enter, a script) all pass the check and all post; because the channel is anonymous,
moderators cannot tell who is flooding it.

Improvement sweep of 2026-10-20 (security/abuse lens), vetted against the code; the ranked report is the owner's "Repo improvement sweep" doc.

## Files you OWN

- `bots/discord/src/commands/confess.ts`

## What to do

1. Set the cooldown right after the check, before any await, and clear it again if the submission fails validation.

## Acceptance

- Two concurrent submissions from one member: one posts, the other gets the cooldown reply (test).
