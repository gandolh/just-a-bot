---
summary: What the two 2026-09-26 improvement audits found and how each finding was fixed on 2026-10-02 to 2026-10-07 — crash guard, mention default, timers, trades, atomic JSON writes, the test suite, /help from the registry, quote permissions, date checks, the container's state mounts — with the non-obvious calls and the Discord checks still owed.
updated: 2026-11-02
---

# The 2026-09-26 audits and their fixes

Two read-only passes on 2026-09-26 (the "Improvements audit" and a "Second
improvements pass" that also read `vps-deploy`) found 21 problems. All were
fixed on 2026-10-02, except the state move, which deployed on 2026-10-07. The
log has one entry per fix. This page keeps what is still true and easy to
undo by accident.

**Not checked in Discord.** No dev application token was on this machine, so
every fix was verified with typecheck, tests or a scratch script, never live.
The checks still owed are at the end.

## Crashes and pings

- **No reply in a listener can kill the bot.** The `@mention` echo is deleted;
  `MessageCreate` only routes Wordle and Hangman thread messages. The client
  logs `Events.Error`, and a module-level `unhandledRejection` handler logs
  instead of exiting. There is deliberately **no `uncaughtException`
  handler**: a genuine synchronous crash should still exit and be restarted
  (by pm2 locally, by the container's `restart: unless-stopped` in
  production). See `bots/discord/src/index.ts`.
- **Mentions default to users only.** The client option
  `allowedMentions: { parse: ['users'], repliedUser: true }` covers every place
  user text is echoed (reminders, `/ask`, RPG duel proposals, the town crier),
  so no stored text can ping `@everyone` or a role. `/give` keeps its own
  per-message override. RPG character names still ping members (open brief 08).

## Games

- **Connect Four's 90 s timer is per turn** (`armTurnTimer`), cleared and
  re-armed after every move, the bot's reply move included. Before, a game
  longer than 90 s ended in a forfeit.
- **An RPG controller can't act mid-fight.** With an encounter open, anything
  but fight, flee or a combat potion shows the combat screen ("You're in a
  fight!"). An older controller message could rest, explore or travel.
- **Trades count copies.** `executeTrade` fails when an inventory holds fewer
  copies than offered and gives the receiver only what the giver lost. The dupe
  was not reachable: the trade menu offers each item once. This is hardening
  for the day an offer can hold duplicates.
- **Mafia phases resolve once.** `resolveDay`/`resolveNight` take an in-memory
  claim keyed **per phase** (`guild:day`, `guild:night`), not per guild: a night
  that ends while the day is still sending DMs must not be dropped.
  `launchGame` takes a `launching` claim that both join paths respect. A lobby
  timer only expires the lobby it was armed for (`createdAt`), and
  `rearmMafiaTimers` re-arms every persisted game at `ClientReady`, resolving
  at once if the deadline passed while the bot was down. A harness with the
  claims removed failed the race tests.
- **Hangman words are `^[a-z]+$`** ("jalapeño" was unwinnable); a test holds it.

## Persistence

`shared/src/json-file.ts` is the one way the bot writes JSON:
- **Atomic.** Each write goes to `<file>.<pid>.tmp`, is fsynced, then renamed.
  The pid is in the name because a restart or deploy can briefly overlap two
  processes, and two writers on one temp name renamed each other's file away.
- **One chain per path**, so a failed write rejects for its own caller only
  and later writes still land. The old chain stopped all writes after one
  failure.
- **Shutdown flushes.** `index.ts` clears the timers, awaits the RPG worlds and
  `flushPendingWrites()` (bounded at 3 s), then exits; `ecosystem.config.cjs`
  gives pm2 `kill_timeout: 5000`.
- Checked by `kill -9` at random points on a 1.4 MB write loop, 20 times: the
  file always parsed. Shutdown still stops at the first RPG world that fails to
  flush (open brief 06).

## Commands

- **`/help` is built from the registry** (`setHelpCatalog`), one line per
  subcommand, grouped by name with an "Other" catch-all, so a new command shows
  up without editing `help.ts`. A group spills into "(cont.)" fields past 1024
  characters. Social was at 1005 of 1024 on 2026-10-02, so the next social
  command spills over by design. `commands/help.test.ts` checks every
  registered command appears.
- **`/quote add` only saves what the invoker can read.** The channel must give
  them `ViewChannel` and `ReadMessageHistory`; a missing channel, a DM, an
  uncached member and a refusal all get the same reply, so the check never
  confirms a hidden channel exists. Private threads are not covered yet (open
  brief 07).
- **Dates must exist.** `/birthday` refuses a day past the month's length
  (February allows 29); `/remindme`'s ISO form refuses 2026-02-30 instead of
  rolling it into March.
- **Reminder text is capped at 1000 characters** on the slash command, and
  `reminderMessage` truncates on delivery so a message never passes 2000; the
  list clips each line to 80 characters and stops before 1900.
- **`/clock` prints each zone's own UTC offset** (`getUtcOffsetMinutes`); it
  printed the host's for every zone.
- **The trivia fetch times out after 5 s** into the fallback bank. When
  testing it in a script, keep the process alive: `AbortSignal.timeout`'s
  timer is unref'd, so a bare script exits before it fires.

## Dependencies and tests

- discord.js is pinned at 14.27.0 and the `/img` renderer exactly (satori
  0.26.0, @resvg/resvg-js 2.6.2); `npm audit` was clean on 2026-10-02.
- `npm test` runs zero-dependency `node:test` files through tsx in `shared` and
  `bots/discord`: blackjack ace demotion, Wordle repeated letters, Connect Four
  wins and draws, reminder and date parsing, trade conservation, hangman words,
  `/help`, and since 2026-10-09 the Jukebox. 67 tests on 2026-11-02.

## The container's state

The estate deploys the bot as a container only (since 2026-09-06). Before
2026-10-07 its state sat in the container's writable layer, the deploy's rsync
rewrote `bots/data` on every run, and the image baked in the builder's
reminders and birthdays. Now:
- `infrastructure/docker-compose.yml` bind-mounts `JUST_A_BOT_DATA` and
  `JUST_A_BOT_DISCORD_DATA`; `vps-deploy` points them at
  `/srv/just-a-bot/state/{shared,discord}`, outside its mirror, and excludes
  `bots/data` and `/state` from the rsync.
- `.dockerignore` keeps both data directories out of the image.
- The owner purged the old state rather than reconcile two copies; the bot
  started fresh on 2026-10-07 ([decisions.md](decisions.md)).

## Owed in Discord

On a dev application (never with production's token, see the root
`CLAUDE.md`): `@mention` the bot and `/ping`; a reminder with `@everyone` in
it; two 60 s Connect Four turns and one over 90 s; two RPG controllers mid-fight;
`/clock show`; `/trivia`; a long reminder and `/remindme list`; Mafia day and
night timers across a restart; `/help`; `/quote add` from a channel the member
can't read; `/birthday set 04-31`; `/coins add 1`, deploy, and the balance
survives.
