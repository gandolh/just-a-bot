---
summary: Dated snapshot of where the project stands right now — a single Discord bot whose music (the Jukebox, playing atrium's library) is built in briefs 25-27 but not yet heard in Discord or deployed, /dicetable removed, and 21 audit briefs (04-24) queued from two passes, in rank order.
updated: 2026-10-21
---

# Status — 2026-10-02

Where things stand right now.

## Music

Built 2026-10-09 (briefs 25-27); not yet heard in Discord or deployed. The **Jukebox** plays Tracks from atrium's
music library in a voice channel. It signs in to atrium as its own local atrium user (brief 29, 2026-10-13; owner steps in [log.md](../log.md)),
and atrium owns every Player, so the bot long-polls atrium for commands (see
[decisions.md](decisions.md)). Three briefs, in order:
- [25](../briefs/done/25-jukebox-atrium-client.md): sign in to atrium as the
  Bot account. **Done 2026-10-09**; `npm run discord:jukebox-check` passes
  locally. The production check is the owner's.
- [26](../briefs/done/26-jukebox-voice-playback.md): voice playback with
  `@discordjs/voice` and DAVE, ffmpeg to Ogg Opus, a two-Track buffer on disk,
  and the long-poll link. **Done 2026-10-09**, run against the local atrium
  with a stand-in speaker. Hearing it in Discord is the owner's check.
- [27](../briefs/done/27-jukebox-slash-commands.md): `/jukebox` subcommands and
  the docs. **Done 2026-10-09**, driven against the local atrium; registering
  and checking in Discord are the owner's.

Atrium's side is built (its briefs 80, 81 and 82, 2026-10-08 to 2026-10-09):
the `jukebox` role allowlist, the Jukebox API, and the page that steers the
bot. It is not deployed yet.

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
  drifted `docs/` pages were corrected at the time.
- **Code graph installed** — `codegraph` 1.6.0, global, MCP in `.mcp.json`.
  Re-benchmarked after the trim: `impact` exact, transitive and 13.5× cheaper;
  `explore` only 1.6× (ruled out); 12 duplicate names still conflate, so never
  rename off it. See [code-graph.md](code-graph.md).
- **Documentation site** (2026-09-07; Docusaurus since 2026-10-19, brief 28):
  `docs-site/` renders `docs/` and `corpus/` as a Docusaurus site at
  `/just-a-bot/docs` (`npm run docs -w @bots/docs-site`). The rendered manual and
  wiki are generated on every build and gitignored; nothing needs re-syncing by hand.
- **Container image** (2026-09-06): `infrastructure/` holds the Dockerfile and
  compose file the estate deploys. **Production is the container** (decisions.md,
  revisited 2026-10-04). Its state moves to two bind mounts outside the rsync
  mirror at `/srv/just-a-bot/state/{shared,discord}`. Briefs
  [07](../briefs/done/07-container-state-volumes.md) and
  [20](../briefs/done/20-estate-state-protection.md) were deployed on 2026-10-07
  with the state purged: the bot started fresh.

## Queued work

**2026-10-02: 19 of the 21 are done** (all but 07 and 20), on the branch
`audit-briefs-2026-09-26`; the first three landed on `main` before the branch
existed. **07 and 20 are waiting on the owner.** They decide where production
state lives and need commands run on the VPS. Several done briefs still owe a
live check on the dev application (no dev token was available), each named in
its outcome. Brief 15 also changed a slash-command schema, so production needs
`npm run discord:register` after the next deploy.

The list below is the original catalog, in rank order, from the two passes on
2026-09-26 (04-19 from the "Improvements audit", 20-24 from the "Second
improvements pass").
[02](../briefs/done/02-remove-dicetable.md) is done. Briefs 01 and 03 were about
the old music approach and were deleted with it on 2026-10-07.

Now (real and cheap):

- [04](../briefs/done/04-crash-guard-event-listeners.md): any member can crash
  the bot. A failed echo reply becomes an unhandled client `error`. Also drops the
  unused voice intent.
- [05](../briefs/done/05-default-allowed-mentions.md): user text in reminders,
  `/ask` and RPG names can ping @everyone. Fix with one client option.
- [06](../briefs/done/06-connect-four-per-turn-timer.md): the Connect Four
  timer runs per game, not per turn. Any game longer than 90 s ends in a forfeit.
- [07](../briefs/done/07-container-state-volumes.md): done 2026-10-07, deployed
  with [20](../briefs/done/20-estate-state-protection.md). State purged, not reconciled.
- [08](../briefs/done/08-rpg-trade-item-dupe.md): RPG trades can duplicate
  items.
- [09](../briefs/done/09-clock-utc-offset.md): `/clock` shows the host's UTC
  offset for every zone.
- [10](../briefs/done/10-bump-discordjs-and-audit.md): discord.js 14.27.0 plus
  `npm audit fix` clears 5 production advisories.
- [11](../briefs/done/11-docs-drift.md): five `docs/` pages contradict the
  code. The setup page names the wrong env vars.
- [12](../briefs/done/12-corpus-drift.md): the wiki and root CLAUDE.md still
  describe `player.ts`, two workspaces, and yt-dlp upkeep.
- [13](../briefs/done/13-rpg-block-actions-in-combat.md): a stale RPG
  controller can rest, explore or travel mid-fight.
- [14](../briefs/done/14-trivia-fetch-timeout.md): the OpenTDB fetch has no
  timeout.
- [15](../briefs/done/15-reminder-text-length.md): a long reminder is deleted
  undelivered and breaks `/remindme list`.
- [16](../briefs/done/16-hangman-jalapeno.md): "jalapeño" is an unwinnable
  hangman word.

Next (a bigger slice):

- [17](../briefs/done/17-mafia-phase-timers.md): mafia phases can resolve
  twice, a stale lobby timer can kill the next lobby, and nothing re-arms timers
  after a restart.
- [18](../briefs/done/18-crash-safe-json-persistence.md): JSON writes aren't
  atomic, one failed write stops all later ones, and shutdown doesn't wait for
  writes.
- [19](../briefs/done/19-node-test-suite.md): a zero-dependency `node:test`
  suite for the pure game logic.

Second pass (it read `../vps-deploy`, which the first didn't):

- [20](../briefs/done/20-estate-state-protection.md): the estate deploy treats
  the bot as stateless. Its rsync overwrites `bots/data` on every deploy, and
  07's step 4 would overwrite the pm2-era state. **Deploy 07 and 20 together.**
  Done 2026-10-07: deployed with the state purged.
- [23](../briefs/done/23-quote-add-channel-permission.md): `/quote add` saves
  messages from channels the invoker can't read, and `/quote search` then posts
  them publicly.
- [21](../briefs/done/21-help-from-registry.md): `/help` lists 7 removed
  commands and omits 11 of the 25 registered ones. Build it from the registry.
- [22](../briefs/done/22-docs-games-pages.md): `/c4` is documented with an
  option it doesn't take, `/c42` isn't documented, and Wordle and tic-tac-toe
  have no pages.
- [24](../briefs/done/24-reject-impossible-dates.md): `/birthday` accepts 04-31
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

**Done 2026-10-19:** [28](../briefs/done/28-docs-site-on-docusaurus.md) moved
`docs-site/` from Starlight to Docusaurus, built and checked locally, not
deployed. The 42 manual links that are dead on the live site now resolve, and
the generated manual is no longer committed. The deploy waits on vps-deploy
brief 11 (asset check `_astro/` → `assets/`); the owner deploys after it.

**Filed 2026-10-21: briefs 29-39**, every Now and Next item of the 2026-10-20 improvement
sweep (the Jukebox, the 2026-10-02 fixes as new code, and member abuse). 29-33 are Jukebox bugs to
fix before its first run; 33 is a check to make on that run. The sweep's watch list is not briefed.

- [29](../briefs/todo/29-jukebox-failed-join-teardown.md) (Now): Jukebox: tear down a voice join that times out
- [30](../briefs/todo/30-jukebox-advance-once-per-error.md) (Now): Jukebox: one playback error advances once
- [31](../briefs/todo/31-jukebox-queue-reply-length.md) (Now): Jukebox: keep `/jukebox queue` under Discord's 2000 characters
- [32](../briefs/todo/32-jukebox-remember-buffer-failures.md) (Now): Jukebox: remember a song that failed to buffer
- [33](../briefs/todo/33-jukebox-slow-path-replies.md) (Now): Jukebox: make sure slow replies stay visible (first-run check)
- [34](../briefs/todo/34-shutdown-drains-every-store.md) (Now): Shutdown drains every store, even when one RPG world fails
- [35](../briefs/todo/35-quote-private-thread-check.md) (Now): `/quote add`: refuse messages from private threads the member is not in
- [36](../briefs/todo/36-rpg-names-no-pings.md) (Now): RPG: character names must not ping members
- [37](../briefs/todo/37-confess-cooldown-race.md) (Now): `/confess`: set the cooldown before the first await
- [38](../briefs/todo/38-rpg-proposals-and-pruning.md) (Next): RPG: one pending proposal per pair, and prune finished duels and trades
- [39](../briefs/todo/39-ask-limits.md) (Next): `/ask`: limit the model, the rate and the length

## Corpus

Updated to corpus-flow 0.29.0 (2026-08-27): `summary:`/`updated:` frontmatter on
every wiki page, a generated `index.md` catalog, [lint.sh](../lint.sh), a
[glossary](glossary.md), knowledge routing in [routing.md](../routing.md), and
`decisions.md` reformatted with rejected alternatives + reasons. The code-graph
half of the spec is deliberately not installed — see
todo.

## Rest of the bot

Many features in place (games, gambling, AI chat, image gen, reminders, RPG).
Not yet catalogued in the corpus — pages will be added as work touches them;
their operating manuals are under
[`docs/discord/`](../../docs/discord/README.md).

**`/dnd` and `/post` are deleted** (2026-10-06). Both had been hidden since
early June with no recorded reason; the owner chose to delete them. See
[decisions.md](decisions.md).

