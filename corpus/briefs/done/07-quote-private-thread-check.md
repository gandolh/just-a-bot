# Task 07: `/quote add`: refuse messages from private threads the member is not in

## Context

`commands/quote.ts:133-137` (commit ed8185d) checks `channel.permissionsFor(user)` for
ViewChannel and ReadMessageHistory. For a thread, discord.js 14.27.0 returns the parent channel's
permissions (`ThreadChannel.js:283-284`), and the comment at `quote.ts:130` assumes that is enough.
A member with a link into a mod-only private thread under a public channel passes; the bot (which
has Manage Threads) can fetch the message; the quote is then shown publicly by `/quote random`,
`search` and `by`.

Improvement sweep of 2026-10-20 (fixes of 2026-10-02 lens), vetted against the code; the ranked report is the owner's "Repo improvement sweep" doc.

## Files you OWN

- `bots/discord/src/commands/quote.ts` (the permission check)

## What to do

1. For a private thread, also require that the member is in the thread (`thread.members.fetch(userId)` succeeds) or has Manage Threads on the parent.
2. Keep the single refusal message.

## Acceptance

- A private thread whose members exclude the user is refused; a public thread works as before (unit test with stubbed channels).

## Outcome (2026-11-02)

Built in `de412dd`; the docs page says it in `b620f06`.

- The check moved into `canQuoteFrom(channel, userId)` in
  `commands/quote.ts`. It keeps the ViewChannel + ReadMessageHistory check
  (the parent's, for a thread). For a `PrivateThread` it also requires Manage
  Threads on the parent, or that `thread.members.fetch({ member, force: true })`
  succeeds. `force` skips the cache, so a member who has left the thread is
  not let through on a stale entry.
- Public threads and plain channels behave as before. Every refusal is still
  "You can't quote from a channel you can't read."
- The "Save Quote" context menu was left alone: it acts on a message the
  member is looking at.

Checks: typecheck clean; bot tests 81/81. New `commands/quote.test.ts` with
stubbed channels: a readable channel passes, a missing permission or an
uncached member fails; a public thread passes without a member lookup; a
private thread whose members exclude the user is refused; its members and a
Manage Threads holder pass. The bot was not run.

**Owed by the owner** (optional, live): `/quote add` with a link into a
private thread you are not in, from an account without Manage Threads, is
refused.
