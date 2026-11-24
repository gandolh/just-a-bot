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
