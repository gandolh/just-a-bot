---
summary: Dated snapshot of where the project stands right now — a single Discord bot with music and /dicetable both removed, and 21 audit briefs (04-24) queued from two passes, in rank order.
updated: 2026-09-26
---

# Status — 2026-08-27

Where things stand right now.

## Music — REMOVED

Gone as of 2026-08-27: 333 lines and all eight audio dependencies
(`npm install` dropped 275 packages). Reviving it is a **rebuild**, not an
uncomment. Post-mortem with the findings worth keeping:
[music.md](music.md). Plan, including the one cheap test that was never run:
[reenable-music.md](../todos/reenable-music.md).

Hold is active — the user is researching a provider that works from a datacenter
IP without cookie refreshing.

## Scope — Discord-only since 2026-08-27

`bots/slack`, `bots/whatsapp` and `bots/dice-activity` were removed; <!-- stale-ok --> workspaces
are now `shared` + `bots/discord`. Rationale and the non-obvious consequences:
[decisions.md](decisions.md). Typecheck clean after the trim.

**`/dicetable` removed** (2026-08-27, brief 02) — it was a WebSocket client of the
deleted Activity app. Gone with it: the command, `dicetable/`, the three
`DICE_ACTIVITY*` env vars, the shared dice wire protocol, the docs page, and the
`ws` direct dependency. `shared/` is down to logger, loadEnv and the reminder
parse/store — still its own workspace, so the "no `discord.js` here" boundary
stays mechanically enforced.

## Tooling / knowledge layers

- **Root [CLAUDE.md](../../CLAUDE.md)** now exists — a fresh session is pointed at
  `corpus/index.md` instead of discovering the repo by grep.
- **`docs/` ↔ `corpus/` boundary settled** (2026-08-27): `docs/` is the how
  (per-feature operating manuals, setup, triage), `corpus/` is the why, and
  `docs/` ranks last in the source-of-truth order. Both front doors say so. Two
  drifted `docs/` pages were corrected at the time; the music page has since been
  deleted with the feature.
- **Code graph installed** — `codegraph` 1.6.0, global, MCP in `.mcp.json`.
  Re-benchmarked after the trim: `impact` exact, transitive and 13.5× cheaper;
  `explore` only 1.6× (ruled out); 12 duplicate names still conflate, so never
  rename off it. See [code-graph.md](code-graph.md).

## Queued work

As of 2026-09-26, 21 briefs are queued from two improvements passes the same
day: 04-19 from the first (log entry "Improvements audit") and 20-24 from the
second (log entry "Second improvements pass"). Each pass is listed in rank
order, and all are in `briefs/todo/`.
[01](../briefs/done/01-music-audio-quality.md) and
[02](../briefs/done/02-remove-dicetable.md) are done, and
[03](../briefs/superseded/03-remove-ytdlp-path.md) was superseded.

Now (real and cheap):

- [04](../briefs/done/04-crash-guard-event-listeners.md): any member can crash
  the bot. A failed echo reply becomes an unhandled client `error`. Also drops the
  unused voice intent.
- [05](../briefs/todo/05-default-allowed-mentions.md): user text in reminders,
  `/ask` and RPG names can ping @everyone. Fix with one client option.
- [06](../briefs/todo/06-connect-four-per-turn-timer.md): the Connect Four
  timer runs per game, not per turn. Any game longer than 90 s ends in a forfeit.
- [07](../briefs/todo/07-container-state-volumes.md): the container has no data
  volume and `bots/data` is baked into the image. Needs the user to say whether
  pm2 or Docker is live.
- [08](../briefs/todo/08-rpg-trade-item-dupe.md): RPG trades can duplicate
  items.
- [09](../briefs/todo/09-clock-utc-offset.md): `/clock` shows the host's UTC
  offset for every zone.
- [10](../briefs/todo/10-bump-discordjs-and-audit.md): discord.js 14.27.0 plus
  `npm audit fix` clears 5 production advisories.
- [11](../briefs/todo/11-docs-drift.md): five `docs/` pages contradict the
  code. The setup page names the wrong env vars.
- [12](../briefs/todo/12-corpus-drift.md): the wiki and root CLAUDE.md still
  describe `player.ts`, two workspaces, and yt-dlp upkeep.
- [13](../briefs/todo/13-rpg-block-actions-in-combat.md): a stale RPG
  controller can rest, explore or travel mid-fight.
- [14](../briefs/todo/14-trivia-fetch-timeout.md): the OpenTDB fetch has no
  timeout.
- [15](../briefs/todo/15-reminder-text-length.md): a long reminder is deleted
  undelivered and breaks `/remindme list`.
- [16](../briefs/todo/16-hangman-jalapeno.md): "jalapeño" is an unwinnable
  hangman word.

Next (a bigger slice):

- [17](../briefs/todo/17-mafia-phase-timers.md): mafia phases can resolve
  twice, a stale lobby timer can kill the next lobby, and nothing re-arms timers
  after a restart.
- [18](../briefs/todo/18-crash-safe-json-persistence.md): JSON writes aren't
  atomic, one failed write stops all later ones, and shutdown doesn't wait for
  writes.
- [19](../briefs/todo/19-node-test-suite.md): a zero-dependency `node:test`
  suite for the pure game logic.

Second pass (it read `../vps-deploy`, which the first didn't):

- [20](../briefs/todo/20-estate-state-protection.md): the estate deploy treats
  the bot as stateless. Its rsync overwrites `bots/data` on every deploy, and
  07's step 4 would overwrite the pm2-era state. **Deploy 07 and 20 together.**
- [23](../briefs/todo/23-quote-add-channel-permission.md): `/quote add` saves
  messages from channels the invoker can't read, and `/quote search` then posts
  them publicly.
- [21](../briefs/todo/21-help-from-registry.md): `/help` lists 7 removed music
  commands and omits 11 of the 25 registered ones. Build it from the registry.
- [22](../briefs/todo/22-docs-games-pages.md): `/c4` is documented with an
  option it doesn't take, `/c42` isn't documented, and Wordle and tic-tac-toe
  have no pages.
- [24](../briefs/todo/24-reject-impossible-dates.md): `/birthday` accepts 04-31
  and never fires. `/remindme` rolls 2026-02-30 over to March 2.

The second pass also added an addendum to 07 (pointing at 20) and a part (d) to
17 (the same unclaimed-transition race in `launchGame`).

These pairs edit the same files, so don't run them in the same wave:

- `bots/discord/src/index.ts`: 04, 05, 17, 18
- `mafia/store.ts`: 17, 18
- package files: 10, 19
- root `CLAUDE.md`: 12, 19
- `docs/common/setup.md`: 11, 19
- `docs/discord/README.md` and the docs-site manual: 11, 22
- `infrastructure/` and the estate stack: 07 and 20 ship together, not apart

One thing outside the repo is still outstanding: the Discord app secrets from the
Activity experiment (`DISCORD_CLIENT_SECRET`, `SESSION_HMAC_KEY`,
`ENGINE_AUTH_TOKEN`) need rotating or the app deleting in the developer portal.
The local `.env` is gone, which does not invalidate them.

## Corpus

Updated to corpus-flow 0.29.0 (2026-08-27): `summary:`/`updated:` frontmatter on
every wiki page, a generated `index.md` catalog, [lint.sh](../lint.sh), a
[glossary](glossary.md), knowledge routing in [routing.md](../routing.md), and
`decisions.md` reformatted with rejected alternatives + reasons. The code-graph
half of the spec is deliberately not installed — see
[todo](../todos/add-code-graph-layer.md).

## Rest of the bot

Many features in place (games, gambling, AI chat, image gen, reminders, RPG).
Not yet catalogued in the corpus — pages will be added as work touches them;
their operating manuals are under
[`docs/discord/`](../../docs/discord/README.md).

**Two commands are hidden, and nobody wrote down why** (found 2026-08-27):
`/dnd` and `/post` are commented out of `commands/index.ts` — `/dnd` in commit
`0e41efc` ("save"), `/post` in `732889c` ("comment post for now"). Their code and
docs are intact. Until the reason is recorded these are *undefended* hides: the
wiki and docs claimed both worked, which has now been corrected, but the intent
(temporary? abandoned?) is still unknown. See
[open-questions.md](open-questions.md).

## Maintenance note

The bundled yt-dlp binary must be kept current (`yt-dlp -U`); `npm install` may
reset it to the pinned version. Stale yt-dlp is a recurring YouTube-breakage
risk.
