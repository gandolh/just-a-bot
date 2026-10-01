# Task 05 — Default `allowedMentions` on the client so user text can't ping @everyone or roles

## Context

Source: the 2026-09-26 improvements audit, recorded in [log.md](../../log.md).
Rank 2 of 16.

The `Client` in `bots/discord/src/index.ts:23-32` sets no `allowedMentions`, and
only `commands/give.ts:58` sets it per message. discord.js applies the client
default to every send, reply, editReply and followUp that doesn't pass its own
(`node_modules/discord.js/src/structures/MessagePayload.js:177-180`). So wherever
the bot posts user-supplied text as plain content, that user can make the bot
ping @everyone, @here, or any mentionable role. The bot usually holds Mention
Everyone. Ordinary members usually don't.

Confirmed sinks:

- `reminders/tick.ts:18-20` posts the `/remindme` text verbatim.
  `/remindme set when:1m text:@everyone free nitro` pings the whole server a
  minute later.
- `commands/ask.ts:78-84` echoes the prompt as a quote header and posts the model
  output as-is. `/ask prompt:"@here hi"` pings on the header alone.
- `commands/rpg-buttons.ts:375-378` puts `challenger.name` in the public duel
  proposal. Names come from a free-text modal (`rpg-buttons.ts:130`, max 24
  characters, and `<@&roleId>` fits).
- `rpg/crier.ts:18-20` has the town crier re-post lines built from those same
  character names (`rpg/combat.ts:151-169`) on every 20 s tick that has queued
  events. That makes the ping repeatable without any further action.
- The mention echo at `index.ts:194`, which brief 04 deletes.

Confessions are safe. They post as an embed description, and Discord never pings
from embeds.

## Files you OWN

- `bots/discord/src/index.ts` (the `Client` options only)

## Files you must NOT touch

- Individual call sites. One client default covers them all, and `give.ts`'s
  per-message override keeps working.
- Character-name sanitizing. It isn't needed once the default is in place.
- Briefs 04, 17 and 18 also edit `index.ts`. Don't run this brief in the same
  wave as any of them.

## What to do

1. Add `allowedMentions: { parse: ['users'], repliedUser: true }` to the `Client`
   options.

That keeps every intentional `<@userId>` ping working, which covers reminders,
birthdays, mafia, dice2 and give, while blocking everyone, here and roles. Don't
use `parse: []`. Reminders and birthdays rely on `<@id>` actually pinging the
user, so it would silence them. A user can still make the bot ping one specific
person by typing `<@id>`, but members can do that themselves anyway.

## Acceptance

- `npm run typecheck` clean.
- On the dev application, `/remindme set when:1m text:@everyone test` arrives,
  pings you, and shows `@everyone` as inert text. A second account in the dev
  guild gets no notification.
- `/ask prompt:"@here hello"` notifies no one else (needs `OLLAMA_API_KEY` on dev,
  otherwise skip).
- `/give` still pings its target.
