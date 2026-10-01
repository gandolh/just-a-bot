# Task 23 — `/quote add`: only save messages the invoker can read

## Context

Source: the second 2026-09-26 improvements pass, recorded in [log.md](../../log.md).
Rank 2 of the second pass.

`handleAdd` in `bots/discord/src/commands/quote.ts:110-150` takes a message link,
checks that it points into the same server (`:118`), and then fetches the
channel and message with the bot's own permissions (`:125-133`). It never checks
whether the member running the command can see that channel.

The saved text doesn't stay private. `/quote random`, `/quote search` and
`/quote by` post it as a public embed (`:159`, `:170`, `:182`), and
`/quote list` pages through it.

Failure scenario: a mod pastes a link to a message in a mod-only channel into a
public channel, or a member gets one some other way. A member without access to
that channel runs `/quote add link:<it>`, and the bot saves the message. Then
`/quote search text:<a word from it>` posts the hidden message to everyone in
the current channel. The bot has become a way to read channels the member was
never given.

The "Save Quote" message menu (`quote.ts:82-107`) is safe. Discord only offers
it on a message the member is already looking at.

## Files you OWN

- `bots/discord/src/commands/quote.ts`, `handleAdd` only

## Files you must NOT touch

- The quote store and the display commands. Quotes saved before this fix stay
  as they are. If the user wants old quotes audited, that's a separate call.

## What to do

1. After the channel fetch and before the message fetch, get the invoker's
   permissions with `channel.permissionsFor(interaction.user.id)`. For thread
   channels that call covers the parent's permissions. If the result is null or
   lacks `ViewChannel` or `ReadMessageHistory`, reply "You can't quote from a
   channel you can't read." and stop.
2. The reply is already ephemeral (`deferReply` at `:123`). Give the same
   message whether the channel doesn't exist or the member can't read it, so the
   check doesn't confirm that a hidden channel exists.

## Acceptance

- `npm run typecheck` clean.
- On the dev application, make a channel that a second test account can't see
  and post a message in it. From the second account, `/quote add` with that
  message's link is refused. `/quote search` finds nothing from it.
- From an account that can see the channel, `/quote add` still works, and so
  does the Save Quote menu.
