---
summary: Locked tech/design calls with their rejected alternatives and reasons — read before proposing pnpm, a build step, an ORM-style rewrite, or a different music source.
updated: 2026-08-27
---

# Decisions (locked)

Settled calls. Don't relitigate one without an explicit revisit **and** a
`log.md` note. This page wins over [status.md](status.md) for any choice not
formally revisited.

An entry earns a place here only if it is **hard to reverse**, **surprising
without context**, and **a genuine trade-off**. Obvious choices belong in
[architecture.md](architecture.md), not here.

Decisions that no longer bind anything live in
[decisions-superseded.md](decisions-superseded.md) — this page is what still
constrains new work, so a reader can trust that everything on it is live.

## npm workspaces, not pnpm or yarn

_pre-2026-06-26_ — The monorepo is plain npm workspaces (`shared` + `bots/*`).
Rejected: pnpm, yarn.
**Reason not recorded** — predates the corpus. Treat as locked-by-inertia rather
than defended; if it ever matters, revisit deliberately and record the why.

## No build step — run TypeScript directly with tsx

_pre-2026-06-26_ — The bots run `tsx src/index.ts` in dev **and** in production
under pm2; imports carry explicit `.ts` suffixes (`from './play.ts'`), and
`engines.node` is `>=22.12.0`. Rejected: a `tsc` → `dist/` build.
Reason: there is no compiled artifact to keep in sync with source, so dev and
prod run the same files and a deploy is a `git pull` + restart — a few seconds of
startup traded for one less moving part.
Cost accepted: no type-checking at runtime boundaries (`npm run typecheck` is a
separate step), and `tsx` lives in root **devDependencies** — so
`npm install --production` breaks the run script. If that scenario ever comes up,
move `tsx` to a real dependency rather than reintroducing a build.
Scope, restated 2026-10-02: this decision is about **the bot**, and the bot
still never builds. `bots/dice-activity`, which built, is gone as of 2026-08-27. <!-- stale-ok -->
The one build in the repo since 2026-09-07 is `docs-site`'s `astro build`, a
static documentation site that the bot neither imports nor needs at runtime.

## pm2 for process management

_pre-2026-06-26_ — Long-lived bots run under pm2 via `ecosystem.config.cjs`
(`autorestart`, `max_restarts: 10`, `restart_delay: 5000`). Rejected: systemd
units, containers.
Reason: one small shared VPS, several sibling processes, no container runtime to
maintain — pm2 gives restart policy and log tailing (`pm2 logs`) with a single
committed config file. `pm2 logs` is the first debugging tool in every incident
recorded in [log.md](../log.md), which is the main thing keeping this locked.

## Env validated with Zod at startup, optional integrations degrade

_pre-2026-06-26_ — `bots/discord/src/env.ts` validates the environment through
`@bots/shared`'s `loadEnv`. Rejected: reading `process.env` ad hoc at each call
site.
Reason: bad *required* config fails fast at boot rather than at first use, but a
*missing optional* integration reports "not configured" instead of crashing the
whole bot — one broken API key must not take the other twenty features down.

## Music subsystem removed entirely

_2026-08-27_ — All eight audio dependencies (`discord-player`,
`@discord-player/extractor`, `discord-player-youtubei`, `@discordjs/voice`,
`@discordjs/opus`, `sodium-native`, `ffmpeg-static`, `youtube-dl-exec`) and the
333 lines that used them (`player.ts`, `commands/_music.ts`, the seven commands)
are deleted, along with both cookie env vars, the `music:update-ytdlp` script and
the `docs/discord/music/` <!-- stale-ok --> page. `npm install` drops 275 packages.
Rejected: keeping the code shelved (the standing decision, below — superseded by
this one), and the narrower "remove yt-dlp only" scope decided earlier the same
day, which would have left the youtubei extractor in place.
Reason: with the feature on an open-ended hold, dead code for a provider stack
that had already failed was pure carrying cost — eight dependencies to audit and
upgrade for something nobody could run. The revival is now explicitly a **rebuild**
against whatever provider wins the research, and the discord-player glue would not
have transferred to Lavalink anyway.
Cost accepted, and it is real: reviving music is no longer an uncomment. The
mitigation is that the *findings* survive where the code does not —
[music.md](music.md) is kept as a post-mortem and pins
`git show 4d03ca0:bots/discord/src/player.ts` for anyone who wants the
implementation back.

## JSON files on disk for all state — no SQLite

_pre-2026-06-26_ — Every bit of persisted state is gitignored JSON under
`bots/data/` (cross-bot) and `bots/<bot>/data/` (per-bot), read through an
in-memory cache with a serialized write chain. Rejected: SQLite, which would fit
the access patterns fine.
Reason: the RPG world needs to be ingestible by an LLM **in one read**, and every
volume here is trivial — human- and LLM-readable files are worth more than query
power at this scale. Cost accepted: no transactions, no queries, and the write
chain is the only thing preventing lost updates.

## Feature logic stays free of platform imports

_pre-2026-06-26_ — A feature's pure logic (`game.ts`) imports no `discord.js`;
platform glue (embeds, button prefixes, replies) lives in a separate module, and
commands stay thin. Rejected: writing features directly against the platform SDK.
Original reason: the same logic module could be ported to another bot — the point
of having `shared/` be runtime-agnostic at all.

**Revisited 2026-08-27, downgraded — the original reason is void.** With Slack
and WhatsApp removed there is no other bot to port to, so portability can no
longer justify the split. Kept anyway, on a *different* and weaker basis: it
keeps the data model readable and testable without a Discord client, which is
worth something on its own. It is now a **convention, not a rule** — a feature
that is genuinely easier to write against `discord.js` directly may do so, and
that is not a violation. Do not cite portability to defend it again.

The duplication this used to justify is also gone: Wordle and Tic-Tac-Toe were
duplicated between Discord and Slack, and only the Discord copies remain.

## Discord-only — Slack, WhatsApp and dice-activity removed

_2026-08-27_ — `bots/slack`, `bots/whatsapp` and `bots/dice-activity` deleted <!-- stale-ok -->
(~2,700 lines, 60 tracked files), along with `docs/slack/` <!-- stale-ok --> and
`shared/src/bot-adapter.ts`. <!-- stale-ok --> Workspaces narrowed to `shared` + `bots/discord`.
Rejected: keeping Slack (1,209 lines and six docs pages of working features —
Wordle, Tic-Tac-Toe, reminders, polls, clock), and keeping `dice-activity` on the
grounds that a Discord voice Activity is arguably part of the Discord surface.
Reason: only the Discord bot is actually used or maintained, and every other
workspace was taxing every repo-wide change — the cross-bot abstraction, the
duplicated game modules, and three sets of docs all had to be kept coherent for
code nobody ran.

Consequences worth knowing, since none of them are visible in the diff:

- **`shared/src/dice-protocol.ts` stays.** `bots/discord/src/dicetable/` is a <!-- stale-ok -->
  WebSocket *client* of the Activity app (`link.ts` connects to its `/engine`
  endpoint), so the wire types are still imported by live code. Deleting the
  Activity did not make the protocol dead.
- **`/dicetable` is now a client with no server in this repo.** It degrades
  cleanly — the command already answers "not configured" when
  `DICETABLE_ACTIVITY_URL` is unset — so this is a dormant feature, not a broken
  one. Open thread: [open-questions.md](open-questions.md).
- **Two workspaces, not one.** `shared/` is kept because it holds code with no <!-- stale-ok -->
  `discord.js` dependency, including the protocol above. (As of 2026-09-07 there
  is a third, `docs-site`, and the protocol is gone with `/dicetable`.)
- **`bots/dice-activity/.env` was deliberately left on disk** — it holds <!-- stale-ok -->
  `DISCORD_CLIENT_SECRET`, `SESSION_HMAC_KEY` and `ENGINE_AUTH_TOKEN`, is
  gitignored, and exists nowhere else. Removing it is a manual, irreversible
  call for the user to make.
- The "feature logic free of platform imports" decision above lost its stated
  reason and was formally downgraded rather than quietly kept.

## `/dicetable` removed — the Activities experiment is concluded

_2026-08-27_ — The `/dicetable` feature is deleted outright: `dicetable/`
(451 lines), `commands/dicetable.ts`, `shared/src/dice-protocol.ts`, the <!-- stale-ok -->
`DICE_ACTIVITY_WS_URL` / `DICE_ACTIVITY_TOKEN` / `DICETABLE_ACTIVITY_URL` env
vars, and the docs page. Rejected: shelving it the way music was shelved (the
precedent existed and was considered), and hosting the Activity from its own repo
to make the client work again.
Reason: the Activity app was added and disabled in the *same* commit
(`0de2132`, 2026-06-03) and never ran on the VPS — this was an experiment that
ended at birth, not a working feature that broke. Shelving preserves code for a
revival that isn't planned; Discord Activities will be revisited as a *new* build
rather than by reviving this one.
Cost accepted: the Activity plumbing writeup (OAuth, session, the `/play` +
`/engine` WebSockets, per-channel instance lifecycle) is deleted with the docs
page and survives only in git history — chosen knowingly over keeping a 92-line
reference page.
Follow-on the user owns: `bots/dice-activity/.env` is deleted locally, but <!-- stale-ok -->
`DISCORD_CLIENT_SECRET`, `SESSION_HMAC_KEY` and `ENGINE_AUTH_TOKEN` must be
**rotated or the Discord app deleted** in the developer portal — deleting a local
file does not invalidate a live secret.

## `docs/` and `corpus/` both stay, split why vs how

_2026-08-27_ — [`docs/`](../../docs/README.md) (29 files, per-feature operating
manuals and setup) keeps its own tree; `corpus/` owns decisions, status, and
synthesis. The boundary is written into both front doors and `docs/` ranks last
in the source-of-truth order. Rejected: folding `docs/` into `corpus/wiki/` and
deleting it (would blow the 200-line-per-page cap immediately and lose the
per-feature structure), and leaving the two layers unrelated (they had already
drifted into contradiction — `docs/discord/music/README.md` <!-- stale-ok --> described the shelved
music feature as working).
Reason: they answer different questions for different readers, and the failure
mode was never duplication — it was that nothing said which one to trust. Cost
accepted: two places to update when a feature's usage changes.

## Major UX variants ship as sibling commands, not rewrites

_pre-2026-06-26_ — A significantly different take on a working feature ships as
`/featureN+1` (`dice` → `dice2`, `blackjack` → `blackjack2`) sharing extracted
code, rather than replacing the original. Rejected: rewriting the original
command in place, feature-flagging one command into two behaviors.
Reason: the original keeps working for the people already using it, both
variants stay comparable in real use, and a bad variant is deleted instead of
reverted. Cost accepted: command-list clutter and two surfaces to maintain.
