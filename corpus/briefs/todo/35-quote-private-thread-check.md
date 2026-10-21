# Task 35: `/quote add`: refuse messages from private threads the member is not in

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
