# Task 21: The Discord caches are bounded, and the image's node is pinned

**Depends on:** nothing.
**Builder:** Sonnet.
**Before you start:** run `brief-board guide` (the repo's `CLAUDE.md` says so).

Filed 2026-11-24 from the estate's infra review. The owner's answer that day: reduce what each app uses on the
box rather than cap its memory (the box has 3.7 GiB and no upgrade). The bot used 112.3 MiB on the box that day,
the second-largest app, a few hours after the rollout restarted it. It restarts only on a deploy, so whatever it
caches grows for weeks.

## Context

- `bots/discord/src/index.ts:35-52` builds the `Client` with intents, partials and `allowedMentions`, and no
  `makeCache` or `sweepers`. `grep -rn "sweepers\|makeCache\|cacheWithLimits"` over `bots/` and `shared/` finds
  nothing.
- discord.js 14.27.0's defaults (its `Options.js`): messages are capped at 200 per channel
  (`DefaultMakeCacheSettings`), and only threads are swept (`DefaultSweeperSettings`). Members and users have no
  limit and no sweep. With `GuildMessages` and `MessageContent` on, every channel the bot reads fills up to 200
  messages, and every author it sees stays as a member and a user until the next restart.
- What the code reads from the caches, by `grep` on 2026-11-24: `guilds.cache` and `channels.cache` lookups;
  `guild.members.me` (`jukebox/speaker.ts:115`); a voice channel's `members`, then `member.user.bot`
  (`speaker.ts:221`), which needs those members and their users cached. Messages and other members are fetched
  (`quote.ts:122` and `:153`, `mafia.ts:470`, `clock.ts:116`, `top.ts:49`), which works with or without a cache.
- Estimate (not measured): 10-30 MiB now, more with uptime.
- **The base floats.** `FROM node:24-alpine` (lines 14 and 22 of `infrastructure/Dockerfile`) follows whatever
  the tag is on the build day: on the laptop it is Node 24.21.0 on alpine 3.24.2, while imbatranimOS pins
  `node:24.22.1-alpine`. vps-deploy's weekly housekeeping removes a base tag no image uses after two weeks; the
  next deploy pulls the tag's current image and every cache entry keyed on the old one is dead.

## Decisions

- The cache settings live in a module of their own beside `index.ts` (for example `client-cache.ts`), so a test
  can import them without loading the `.env`.
- **Messages:** at most 25 per channel, and a sweeper drops messages older than 30 minutes, every hour.
- **Members and users:** swept every hour, except the bot's own member and user and anyone in a voice channel
  (the Jukebox counts listeners from those). Nothing else the code reads may be evicted; step 1 confirms it.
- Every other manager keeps discord.js's default.
- Both `FROM` lines are `node:24.22.1-alpine`. The estate moves to a new patch in one sweep.

## Files you OWN

- `bots/discord/src/index.ts` (the `Client` options only) and the new settings module, with a test beside it
- `infrastructure/Dockerfile` (the two `FROM` lines)
- `corpus/wiki/architecture.md` (a line on the cache policy); the closeout: the outcome note, `corpus/log.md`,
  `corpus/wiki/status.md`

## Files you must NOT touch

- `bots/discord/.env`, ever: it holds the production token. Never start the bot or register its commands from
  this checkout (`discord:dev`, `discord:start`, `discord:register`), and never run `npm test`; use
  `npm run test:clean` (the root `CLAUDE.md` says why).
- The commands and the Jukebox beyond what the cache policy forces.

## What to do

1. **List every cache read.** `grep -rn "\.cache\b\|\.members\b\|\.member\b\|\.user\b\|voice\." bots/discord/src`
   and read each hit: does it read a cache or fetch? Check the event listeners too
   (`client.on(Events.` …): a handler on old messages or reactions needs them cached or a partial. Write the list
   in the outcome, and if something besides the Jukebox reads members or users from the cache, keep it in the
   sweep's exceptions.
2. The settings module, as decided; `index.ts` passes it to the `Client`.
3. Tests on the module: the member and user filters keep the bot and a member in a voice channel and drop
   another; the message limit is 25.
4. The two `FROM` lines.

## Acceptance

- [ ] Step 1's list is in the outcome.
- [ ] The tests pass; `npm run check` exits 0 (it runs `test:clean`); `npm run corpus:lint` passes.
- [ ] End move `ready_for_deploy`, with the memory reading below as a test note.

## Owner steps

- `node cli.ts just-a-bot server` from vps-deploy. The image builds on the box.
- A day later, `docker stats --no-stream just-a-bot` on the box (read only), against 112.3 MiB on 2026-11-24 a
  few hours after a restart. Then play a track in a voice channel: the Jukebox still sees its listeners.

## Outcome (2026-11-24)

Built in `9c02063`. `bots/discord/src/client-cache.ts` holds the policy; `index.ts` spreads it into the `Client`.
Messages: 25 per channel, swept hourly when older than 30 minutes (an edit renews). Members and users: swept hourly
unless the bot itself or in a voice channel (users: any guild's voice states hold them). Threads keep the default sweep.

Step 1, every cache read in `bots/discord/src`:

- `speaker.ts:102`, `:243` `guilds.cache`; `:117`, `:129`, `:219` `channels.cache`: guilds and channels are not swept.
- `speaker.ts:115` `guild.members.me`: the bot's own member, kept.
- `speaker.ts:221` voice channel `members` then `member.user.bot`: voice members and their users, kept.
- `jukebox.ts:122-123`, `mafia.ts:239`, `jukebox.ts:132` `interaction.member` and `member.voice`: built from the interaction payload, not the cache.
- `clock.ts:116`, `top.ts:49`, `quote.ts:122` members, `quote.ts:153`, `mafia.ts:470` messages, `mafia/dm.ts` users, many `channels.fetch`: fetches.
- Listeners: `ClientReady`, `Error`, `InteractionCreate`, `MessageCreate` (reads the new message only), `VoiceStateUpdate`, channel create/delete/update. None reads an old message or reaction.

Nothing besides the Jukebox reads members or users from the cache, so the exceptions are the bot and voice members.
Tests (`client-cache.test.ts`): the filters keep the bot and voice members and drop others, the limit is 25, staleness at 30 minutes.
`npm run check` and `npm run corpus:lint` pass. Not run: a container boot (no Docker build needed by the brief) and the memory reading, which is the owner's.
