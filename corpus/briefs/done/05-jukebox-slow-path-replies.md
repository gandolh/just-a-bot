# Task 05: Jukebox: make sure slow replies stay visible (first-run check)

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

## Outcome (2026-11-02)

Built in `039253f`; the live check is still owed.

- Step 1's question has a documented answer. Discord's interaction docs
  ("Receiving and Responding", followup messages) say a follow-up sent
  straight after a deferred response edits the loading message instead of
  creating one, and the ephemeral flag is ignored because an existing
  message's ephemeral state cannot change. The behaviour is marked deprecated
  but still described. So the old slow path put the public answer into the
  ephemeral placeholder and `deleteReply()` then removed it.
- The fix is neither of step 2's options: `answer()` fills the placeholder
  with `editReply()` first, then a public answer goes out as a real
  `followUp()`, and the ephemeral copy is deleted only after that is posted.
  Deferring publicly would make slow errors public, and posting to the
  channel needs Send Messages there and loses the interaction's reply
  header; this keeps who sees what as before (controls public, errors and
  lookups ephemeral). If the follow-up fails, the invoker keeps the
  ephemeral answer.
- `answer()` is exported with an injectable defer delay.

Checks: typecheck clean; bot tests 75/75. New `commands/jukebox.test.ts`
(dummy env, as `help.test.ts` does) records the calls: a fast answer is one
`reply`; a slow public one is `deferReply` (ephemeral), `editReply`,
`followUp`, `deleteReply`; a slow error is `deferReply`, `editReply`. That
checks the order, not Discord. The bot was not run.

**Owed by the owner** (first live run): stop atrium for a moment, or slow
it, run `/jukebox skip`, and check from a second account that "Skipped."
stays in the channel. If it does not, the fallback is deferring publicly for
controls.
