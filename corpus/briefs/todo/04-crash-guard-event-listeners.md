# Task 04 — Keep the bot alive when a Discord call fails inside an event listener

## Context

Source: the 2026-09-26 improvements audit, recorded in [log.md](../../log.md).
Rank 1 of 16.

discord.js builds its client with `captureRejections: true`
(`node_modules/discord.js/src/client/BaseClient.js:16`). When an async listener's
promise rejects, the emitter re-emits the error as the client's `error` event.
`bots/discord/src/index.ts` registers no `error` listener, so Node throws it as an
uncaught exception and the process exits.

The one unguarded listener is the mention echo at `index.ts:188-194`, which runs
`await message.reply(`Echo: ${stripped}`)` with no try/catch. Any member can
trigger the crash. They @mention the bot and delete the message before the reply
lands, or they mention it in a channel where the bot can read but not send
(DiscordAPIError 50013). The reply rejects and the process dies. pm2 restarts it
5 s later (`restart_delay: 5000`), but every in-memory game is gone by then:
blackjack hands, wordle and hangman threads, Connect Four, trivia, mafia phase
timers. The last 2.5 s of debounced RPG moves are lost too.

The echo is a placeholder. It repeats the text back and does nothing else, and it
is also a mention-injection path (brief 05). Nothing depends on it.

Rejections outside the emitter crash the process as well, because Node 22's
default for an unhandled rejection is to throw. Examples in this repo include
`void flush(guildId)` in the RPG debounce timer (`rpg/world.ts:286`) and
`void resolveDay(...)` / `void resolveNight(...)` in the mafia timers
(`mafia/phases.ts:31`, `:106`). Brief 18 fixes the RPG one at the source. This
brief adds the process-wide safety net.

While in the client constructor, drop `GatewayIntentBits.GuildVoiceStates`
(`index.ts:26`). It is a leftover from the 2026-08-27 music removal. A grep for
`VoiceState`, `voiceState` and `voice` in `bots/discord/src` finds nothing but a
Wordle word. The gateway still streams every voice-state update to the bot and
discord.js caches them.

## Files you OWN

- `bots/discord/src/index.ts`

## Files you must NOT touch

- The other listeners' logic (the InteractionCreate routing, the wordle/hangman
  thread branch).
- `allowedMentions` on the client. Brief 05 owns that line. It edits the same
  file, so don't run the two in one wave. Briefs 17 and 18 also edit this file.
- Persistence and the shutdown sequence (brief 18).

## What to do

1. Delete the mention echo, meaning everything in the MessageCreate listener after
   the `if (message.channel.isThread())` block (`index.ts:188-194`). Keep the
   `message.author.bot` guard and the thread branch.
2. Register `client.on(Events.Error, (err) => log.error('Client error', err));`
   next to the ClientReady listener.
3. Register a module-level
   `process.on('unhandledRejection', (reason) => log.error('Unhandled promise rejection', reason));`.
   Do not add an `uncaughtException` handler. A genuine synchronous crash should
   still restart under pm2.
4. Remove `GatewayIntentBits.GuildVoiceStates` from `intents`. Leave
   `MessageContent` alone, since wordle and hangman read thread messages. Also
   leave `DirectMessages` and `Partials.Channel`.
5. `grep -rn -i "echo" docs/` and remove any claim that mentioning the bot makes
   it reply. As of 2026-09-26 there is none, so this is a check, not an edit.

## Acceptance

- `npm run typecheck` clean.
- `grep -rn "Echo:\|GuildVoiceStates" bots/discord/src` returns nothing.
- On the dev application, never the production token (see CLAUDE.md "One running
  instance per bot token"), run `npm run discord:dev` and @mention the bot. It
  sends no reply and doesn't crash. `/ping` from the same process still answers.
