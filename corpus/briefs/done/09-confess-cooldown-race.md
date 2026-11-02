# Task 09: `/confess`: set the cooldown before the first await

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

## Outcome (2026-11-02)

Built in `5410842`.

- `handleSubmit` became the exported `submitConfession(interaction, store)`.
  It sets the cooldown right after the check, before the first await, then
  runs the rest (`postConfession`, which returns whether it posted) and, in a
  `finally`, deletes its own cooldown entry when nothing was posted.
- "Clear it again if the submission fails validation" covers every
  non-posting path, as the old code's "only after the post succeeds"
  intended: no channel set, the channel gone or not text, the send refused,
  and an unexpected throw. The 1000-character check stays, though the slash
  option already caps the length.
- The store functions are a parameter so the test needs no data directory.

Checks: typecheck clean; bot tests 86/86. New `commands/confess.test.ts`:
two concurrent submissions from one member against a store that takes 5 ms
per call give one post, one "Posted." and one "You're submitting too fast";
a refusal (no channel set) leaves no cooldown, so the next submission posts.
The confessions manual says when the cooldown starts. The bot was not run.

**Owed by the owner:** nothing beyond the usual live smoke test.
