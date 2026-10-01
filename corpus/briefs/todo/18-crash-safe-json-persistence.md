# Task 18 — Make JSON persistence crash-safe: atomic writes, a write chain that recovers, a flush on shutdown

## Context

Source: the 2026-09-26 improvements audit, recorded in [log.md](../../log.md).
Rank 15 of 16 ("Next": a real integrity gap, but it touches nine modules).

[decisions.md](../../wiki/decisions.md), "JSON files on disk for all state",
accepts this cost: "no transactions, no queries, and the write chain is the only
thing preventing lost updates". The write chain carries all of that weight, and
it has three holes. This brief keeps JSON. It does not reopen the decision.

The same load/persist code is copy-pasted into nine modules:

- `shared/src/reminders/store.ts`
- `bots/discord/src/gambling/wallet.ts`
- `bots/discord/src/confessions/store.ts`
- `bots/discord/src/quotes/store.ts`
- `bots/discord/src/mafia/store.ts`
- `bots/discord/src/rpg/world.ts`
- `bots/discord/src/dnd/state.ts`
- `bots/discord/src/clock/timezones.ts`
- `bots/discord/src/reminders/birthdays.ts`

### 1. Writes aren't atomic

Every persist calls `writeFile(path, snapshot)`, which truncates the file and then
writes it. If the process dies mid-write, the file is left empty or half-written.
That happens with pm2's SIGKILL after its 1.6 s default `kill_timeout`, an OOM
kill, or a crash (see brief 04). On the next load, `JSON.parse` throws a
SyntaxError, and every loader rethrows anything other than ENOENT (for example
`wallet.ts:21-24` and `world.ts:337-340`). The affected feature then fails on
every call until someone repairs the JSON by hand. For `wallets.json` that means
all of gambling. For a guild's world file it means the whole RPG.

### 2. One failed write stops all later writes

The chain is built as `writeChain = writeChain.then(write)` (`wallet.ts:30`,
`shared/src/reminders/store.ts:38`, and per-guild variants of the same). If one
write rejects, say with ENOSPC or EACCES on a bind mount, the chain becomes a
rejected promise. From then on `.then(write)` skips every later write, and each
`persist()` rejects immediately. The in-memory cache keeps changing while nothing
reaches disk until a restart, and the restart loads the stale file.

### 3. Shutdown doesn't wait for writes

- `index.ts:215-224` runs `client.destroy().finally(() => process.exit(0))`.
- `rpg/world.ts:306-315` registers its own SIGINT/SIGTERM handler, which starts
  `flushAllWorlds()` without anything awaiting it.
- `index.ts`'s handler was registered first and exits as soon as `destroy()`
  resolves.

So the last 2.5 s of debounced RPG moves (`DEBOUNCE_MS`, `world.ts:239`) and any
in-flight write in any store can be cut off, mid-write in the worst case (see 1).
Also, `void flush(guildId)` in the debounce timer (`world.ts:286`) turns a write
failure into an unhandled rejection, which crashes the process. Brief 04 adds a
logging safety net, but this brief should handle the error where it happens.

## Files you OWN

- A new helper in `shared/src/` (for example `json-file.ts`), and its export from
  `shared/src/index.ts`
- The nine persistence modules listed above
- `bots/discord/src/index.ts`: the shutdown sequence
- `ecosystem.config.cjs`: `kill_timeout`

## Files you must NOT touch

- **Load semantics.** ENOENT still yields the default, and any other error still
  throws.
- **Data formats, file locations, and the in-memory cache design.**
  `mafia/store.ts`'s `clearGame` writes `null`, so keep that.
- **Sequencing.** Briefs 04, 05 and 17 also edit `index.ts`, and brief 17 also
  edits `mafia/store.ts`. Don't run any of them in the same wave as this one.

## What to do

1. **Add a small helper in `shared/`** that owns a serialized writer per file:
   - **Atomic write.** Write the snapshot to `<file>.tmp` in the same directory,
     then `rename` it over the target. The rename is atomic on the same
     filesystem, which includes a bind-mounted directory (brief 07).
   - **A chain that recovers.** Each write runs after the previous one settles,
     whether it succeeded or failed (`prev.catch(() => {}).then(doWrite)`). The
     caller that asked for a write still gets its own rejection.
   - **A registry.** Track writes still in flight, and expose
     `flushPendingWrites(): Promise<void>`.

   The helper must not import `discord.js`, which is `shared/`'s one rule.
2. **Move all nine modules' persist/flush code onto the helper.** This is
   mechanical. Each module's exported API stays the same.
3. **`rpg/world.ts`.**
   - Delete `hookShutdown`'s own signal handlers, and keep exporting
     `flushAllWorlds`.
   - In the debounce timer, catch and log flush errors instead of using `void`.
4. **`index.ts` shutdown.** Clear the timers, then `await flushAllWorlds()`, then
   `await flushPendingWrites()`. Bound that with a timeout of about 3 s so a stuck
   disk can't block exit forever. Then call `client.destroy()` and exit.
5. **`ecosystem.config.cjs`.** Set `kill_timeout: 5000` so pm2 waits for step 4
   instead of SIGKILLing after its 1.6 s default. `docker compose stop` already
   waits 10 s.

## Acceptance

- `npm run typecheck` clean.
- `grep -rn "writeFile(" bots/discord/src shared/src` hits only the helper.
- **Kill test** (scratch script). Loop writing a roughly 1 MB object through the
  helper, and `kill -9` the process at random points 20 times. The target file
  parses every time.
- **Recovery test** (scratch script). Make the target directory read-only and
  write, which rejects. Restore permissions and write again. The second write
  lands.
- **Shutdown test** (dev bot). Make an RPG move and send SIGINT within 2 s (Ctrl-C
  on `npm run discord:start`). After a restart, the move is in the world file.
