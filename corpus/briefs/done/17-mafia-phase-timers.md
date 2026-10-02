# Task 17 — Mafia: phases resolve twice, and phase timers aren't tied to their game

## Context

Source: the 2026-09-26 improvements audit, recorded in [log.md](../../log.md).
Rank 14 of 16 ("Next": real bugs, but a bigger slice that needs care).

These are three bugs with one root cause. Phase timers live in process memory,
keyed only by `guildId`. A phase transition isn't claimed until several awaits
after it starts.

### (a) A phase can resolve twice

`resolveDay` (`bots/discord/src/mafia/phases.ts:36-91`) and `resolveNight`
(`:111-153`) guard with `game.phase !== 'day'` / `'night'`. The phase only
changes later, inside `startNight` / `startDay`, after an `updateGame` (a file
write) and a `postToThread` (a Discord API call). `loadGame` returns the shared
cached object (`mafia/store.ts:52-53`). So a second caller inside that window
sees the first caller's kill but still sees the old phase.

- **Vote path** (`commands/mafia.ts:206-214`). Two votes that both reach the
  threshold within a few hundred milliseconds both call `resolveDay`. That's the
  normal pile-on once a majority forms.
  - The first call eliminates the target.
  - The second tallies, finds the top target already dead, and posts "🗳️ No
    majority reached — the day ends without an elimination." Then it calls
    `startNight` again, so night-action DMs go out twice.
  - `nightTimers.set` (`phases.ts:108`) overwrites the first handle without
    clearing it. The orphaned timer later fires `resolveNight` at the wrong time.
- **Night path** (`commands/mafia.ts:333-344`). The mafia member picks a target
  and then another one, or double-clicks, while resolution is running.
  `resolveNight` runs twice, and the second pass kills the new target or posts a
  spurious "nobody died". Then `startDay` runs twice: the day counter skips a
  number and a day timer is orphaned.

### (b) A cancelled lobby's timer hits the next lobby

`commands/mafia.ts:119-121` runs
`setTimeout(() => lobbyExpire(client, guildId), 60_000)` and never keeps the
handle. `cancelTimers` (`phases.ts:172-175`) clears only the day and night maps.
`lobbyExpire` (`mafia.ts:349-370`) finds the game by `guildId` alone and never
checks `lobbyExpiresAt`.

Failure: `/mafia start` at t=0, `/mafia cancel` at t=10, `/mafia start` again at
t=20. At t=60 the first timer fires on the new lobby. With fewer than 5 players it
cancels that lobby 20 s early ("Lobby expired"). With 5 or more it force-launches
it.

`/mafia start-now` (`handleStartNow` → `launchGame`, `mafia.ts:167`) also leaves
the lobby timer armed. `lobbyExpire` then happens to return early, but only
because the phase is no longer `lobby`.

### (c) Nothing re-arms timers after a restart

Game state, including `phaseDeadline` and `lobbyExpiresAt`, is persisted
(`store.ts:40-41`). But nothing re-arms the timers at boot: the ClientReady
listener in `index.ts` only logs. After any restart mid-game (deploy, crash, pm2
restart), the current day or night never ends on its own. `/mafia start` keeps
answering "already running" until the starter or an admin runs `/mafia cancel`.

### (d) Added by the second 2026-09-26 pass: the launch has the same race

`launchGame` (`commands/mafia.ts:372-444`) checks `phase !== 'lobby'` at `:374`,
but the phase only changes when `startDay` runs at `:444`. Between the two sit
`updateGame`, `loadGame` and `sendRoleDms`.

- Two launches in that window both get through: `/mafia start-now` clicked
  twice, or start-now racing the lobby timer. `assignRoles` (`:377`) mutates the
  cached player objects both times, so players get conflicting role DMs, for
  example Mafia and then Town. `startDay` also runs twice.
- A `/mafia join` or join button (`:124-127`, `:279-281`) during `sendRoleDms`
  still sees `lobby`. The player joins with `role: null`, gets no role DM, and
  counts as town.

The fix is the same claim as step 1: take it synchronously at the top of
`launchGame`, and have both join paths refuse while it's held. Add a
double-launch case to the acceptance harness.

## Files you OWN

- `bots/discord/src/mafia/phases.ts`
- `bots/discord/src/commands/mafia.ts`: the lobby timer, cancel, start-now and
  `lobbyExpire`
- `bots/discord/src/mafia/store.ts`: add a way to list persisted games
- `bots/discord/src/index.ts`: one call in the ClientReady listener

## Files you must NOT touch

- The content of `mafia/roles.ts`, `mafia/render.ts` and `mafia/dm.ts`.
- How `store.ts` writes to disk. Brief 18 changes that.
- Sequencing: briefs 04, 05 and 18 also edit `index.ts`, and brief 18 also edits
  `store.ts`. Don't run any of them in the same wave as this one.

## What to do

1. **Claim resolution synchronously.** In `resolveDay` and `resolveNight`, right
   after the phase check and before any `await`, record a claim in a
   module-level `Set<string>` of guild IDs being resolved. Return early if the
   guild is already in the set, and release it in a `finally`. An in-memory claim
   is enough, because the cached game object is shared and a restart clears both.
   Don't add a new persisted `Phase` value unless you also handle it everywhere
   the code switches on the phase.
2. **Never orphan a timer.** `startDay` and `startNight` call `clearTimer` before
   setting a new one.
3. **Tie the lobby timer to its game.**
   - Keep its handle in a `lobbyTimers` map next to the others in `phases.ts`.
   - Clear it in `cancelTimers` and when the game launches.
   - Pass `lobbyExpire` the game's `createdAt` (or `threadId`) captured when the
     timer was armed, and have it return if the current game doesn't match.
4. **Re-arm at boot.**
   - Add `listPersistedGames()` to `store.ts`: read the data directory and
     `loadGame` each entry.
   - Add `rearmMafiaTimers(client)` to `phases.ts`. For each game in `lobby`,
     `day` or `night`, compute the time left from `lobbyExpiresAt` /
     `phaseDeadline`. If the deadline has passed, resolve now. Otherwise arm the
     matching timer for the remainder.
   - Call it from the ClientReady listener in `index.ts`.

## Acceptance

- `npm run typecheck` clean.
- Build a scratch harness, or node:test cases if brief 19 has landed, around a
  stubbed client. `mafia/dm.ts` calls `client.users.fetch(id).send(...)` and
  `client.channels.fetch(threadId)` → `isSendable()` / `send(...)`, so stub
  exactly those.
- **Day race:** seed a day-phase game with 5 alive players where 3 voted for one
  target, then run
  `await Promise.all([resolveDay(c, g), resolveDay(c, g)])`. Expect exactly one
  elimination, the phase at `night`, one night timer armed, and the DM stub
  called once per night role.
- **Night race:** do the same for `resolveNight`. The day counter goes up by
  exactly 1.
- **Stale lobby timer:** create lobby A, cancel it, create lobby B, and let A's
  timer fire (mock timers or a short constant). B is untouched.
- **Re-arm:** persist a day-phase game with `phaseDeadline` 1 s in the future and
  call `rearmMafiaTimers`. `resolveDay` runs about 1 s later.

## Outcome (2026-10-02)

All four parts done, with a scratch harness around a stubbed client (exactly
`users.fetch().send` and `channels.fetch()` → `isSendable`/`send`) on throwaway
`harness-*` guild files, deleted afterwards.

- **(a) Claims.** `resolveDay`/`resolveNight` take a synchronous in-memory
  claim right after the phase check (`${guild}:day` / `${guild}:night`) and
  release it in `finally`. The claim is keyed per phase, not per guild: a night
  that completes while `resolveDay` is still sending night DMs must not be
  dropped by the day's claim.
- **No orphans.** `armDayTimer`/`armNightTimer`/`armLobbyTimer` clear before
  arming.
- **(b) Lobby timer.** `lobbyTimers` lives in `phases.ts`. `cancelTimers` and
  `launchGame` clear it, and `lobbyExpire` gets the `createdAt` captured at
  arm time and leaves any other game alone.
- **(c) Boot.** `listPersistedGames()` (store) and `rearmMafiaTimers(client)`
  arm the remainder for lobby, day and night games, resolving at once if the
  deadline passed while the bot was down. `ClientReady` calls it.
- **(d) Launch.** `launchGame` takes a synchronous `launching` claim, and both
  join paths refuse while it is held.

Harness results: all pass.
- Day race: one elimination, no spurious "no majority", night, one night timer,
  one night DM.
- Night race: day +1 exactly, one kill, one day timer.
- Stale lobby: B untouched by A's still-armed timer, and cancel clears the timer.
- Re-arm: a day with its deadline 1 s out resolved after 1021 ms.
- Double launch: one `startDay`, 5 role DMs, not 10.

**Mutation check:** with the claims commented out, the day race, night race and
double-launch checks all fail. `npm run typecheck` is clean.
