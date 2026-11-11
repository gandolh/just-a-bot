---
summary: Dated snapshot (2026-11-11) of just-a-bot, per area — the Discord-only bot, deployed as a container with its state outside the mirror (2026-10-07); the 2026-09-26 audit fixes (2026-10-02); the Jukebox built (2026-10-09, atrium's own login 2026-10-13) but not heard in Discord or deployed; the docs site on Docusaurus (2026-10-19, not deployed); the eleven briefs of the 2026-10-20 sweep built on 2026-11-02, not deployed; briefs 12-17 built on 2026-11-04 and 2026-11-05 (13-17 not deployed); brief 18, the house style and npm run check, built 2026-11-11; a flaky RPG test; the local .env's WICKET_URL is not a URL; what is left for the owner.
updated: 2026-11-11
---

# Status — 2026-11-11

Production runs the 2026-10-07 container. `npm run check` is the gate since
brief 18 (2026-11-11): typecheck, lint, format, conventions, and the 119 tests
through `npm run test:clean`, in a copy without the `.env` (never `npm test`
in the checkout; see Known issues for the one flaky test). Brief numbering restarted at 01 on 2026-11-02 (see
[`../log.md`](../log.md), "Briefs reset").

## By area

- **Scope** (2026-08-27). Discord-only: the Slack, WhatsApp and dice-table
  Activity bots are gone, and so is `/dicetable`. Workspaces are
  `shared`, `bots/discord` and `docs-site` ([decisions.md](decisions.md),
  [decisions-removals.md](decisions-removals.md)).
- **Removed commands** (2026-10-06). `/dnd` and `/post` are deleted, not
  shelved.
- **The 2026-09-26 audits** (fixed 2026-10-02). Crash guard, users-only
  mentions, per-turn and per-phase timers, counted trades, atomic JSON writes,
  `/help` from the registry, `/quote add` permissions, real dates, a
  `node:test` suite ([audit-fixes.md](audit-fixes.md)).
- **Production** (2026-10-07). A container from `infrastructure/`, deployed by
  `vps-deploy`; state in two bind mounts at `/srv/just-a-bot/state/`, outside
  the rsync mirror. The owner purged the old state, so the bot started fresh.
  Since brief 15 (2026-11-04, not deployed) the image runs `node --import tsx`
  as PID 1 with no npm in front ([architecture.md](architecture.md)).
- **Music: the Jukebox** (built 2026-10-09). The bot plays atrium's library in
  voice, steered by atrium over a long-poll; `/jukebox` is the Discord remote.
  Since 2026-10-13 it signs in as a local atrium user with the `jukebox` role,
  not a Ward account. Run against a local atrium with a stand-in speaker; **not
  heard in Discord and not deployed** ([jukebox.md](jukebox.md)).
- **Docs site** (2026-10-19). `docs-site/` renders `docs/` and `corpus/` with
  Docusaurus at `/just-a-bot/docs`; the rendered pages are generated on every
  build and gitignored. `vps-deploy` flipped the stack to Docusaurus the same
  day; **not deployed**.
- **The house style** (2026-11-11, brief 18, not deployed). Prettier at 120
  with double quotes, the house TypeScript flags and ESLint config, vendored
  from the skills library as `vendor/house-style/` 1.1.0; `npm run check` and
  `check:fast`; `.claude/rules/bot.md` for agents
  ([decisions.md](decisions.md), "The house style, formatted and checked").
- **Knowledge layers.** Root `CLAUDE.md` points at the corpus; `docs/` is the
  how and ranks last; the code graph is installed for impact queries only
  ([code-graph.md](code-graph.md)).
- **Rest of the bot.** Games, gambling, AI chat, image cards, reminders, RPG,
  quotes and confessions work as before. They have no wiki pages; their
  manuals are under [`docs/discord/`](../../docs/discord/README.md). The RPG
  manual was rewritten against the code on 2026-11-04 (brief 12): places and
  buttons, not the tile grid it used to describe. Since brief 16 (2026-11-05,
  not deployed) the Town sells a spare copy of a worn item.

## Open briefs

12, the RPG manual, was done on 2026-11-04 (docs only). 13, done on
2026-11-04, not deployed: `/ask` always uses `OLLAMA_MODEL` (no model option)
and fails privately. 14, done on 2026-11-05, not deployed: `/ask` goes through
Wicket, the estate's LLM queue, with a ticket line while it waits; production
needs `WICKET_URL` and `WICKET_TOKEN` in the bot's `.env` first (the owner's
step). 15, done on 2026-11-04, not deployed: the container starts the bot
with `node` and tsx's loader directly, not through `npm` (the owner's memory
review of the VPS). The eleven briefs from the 2026-10-20 improvement sweep were built on
2026-11-02, one commit each plus a corpus commit (see [`../log.md`](../log.md)):
01-05 the Jukebox's failure paths, checked against atrium's source, 06-09 the
Now items (shutdown drain, private-thread quotes, RPG names, the `/confess`
race), 10-11 the Next items (RPG proposals and pruning, `/ask` limits). None of
it is deployed or run in Discord. 16, done on 2026-11-05, not deployed: the
Town sells a spare copy of a worn item (the sell checks were redundant from
the start, since equipping takes the item out of the bag). 17, done on 2026-11-05
(docs only, ships with the docs site): the architecture and reminders
manuals no longer describe the RPG's old grid, mob tick or map renderer. 18,
done on 2026-11-11, not deployed: the house style and the quality harness. No
brief is open; one todo is (`proposals-test-clock`, the flaky test below).

## Next (owner)

- **The Jukebox in production**, in order: seed a `jukebox` user in atrium;
  put `JUKEBOX_ATRIUM_URL`, `JUKEBOX_ATRIUM_USERNAME` and
  `JUKEBOX_ATRIUM_PASSWORD` in the server's `.env` and drop the old
  `JUKEBOX_WARD_*` names (a partial set stops the bot at boot, naming what is
  missing); deploy atrium, then the bot;
  remove the bot's old `atrium` grant at Ward.
- **Hear it in Discord**: the checks in [jukebox.md](jukebox.md), on a dev
  application or after the deploy.
- **Deploy the docs site** from `vps-deploy`; it ships whenever the bot
  does, so the deploy below carries brief 17 too.
- **The 2026-10-02 fixes in Discord**: the list at the end of
  [audit-fixes.md](audit-fixes.md).
- **The 2026-11-02 briefs in Discord** (each brief's outcome has its check):
  `/jukebox play` from a channel without Speak is refused (01); a song atrium
  cannot serve is skipped once, not twice (02); a slow `/jukebox skip` stays
  visible to a second account (05); `/quote add` into a private thread you are
  not in is refused (07); a duel challenge notifies the defender once (08, 10);
  `/ask` refuses a second question in flight (11).
- **Fix `WICKET_URL` in the bot's `.env` before any deploy** (see Known
  issues), then **briefs 13-17**: deploy (`node cli.ts just-a-bot all` from
  vps-deploy: pre-deploy, deploy, then the server phase; it re-registers the
  commands, which brief 13 changed). Then
  `/ask` offers only `prompt`, a failing question leaves nothing in the
  channel and tells the asker privately, and `docker top` on the bot's
  container shows one `node` and no `npm`. Brief 16: wear a Rusty Dagger
  with a second in the bag, sell the spare in 🏪 Town at the Plaza, and the
  first stays worn.
- **Brief 18**: `git config blame.ignoreRevsFile .git-blame-ignore-revs`
  once in the checkout, and deploy with the rest. Its new devDependencies
  enter the image (the image installs them for `tsx`): `node_modules` from
  the image's `npm ci` grew from 87 MB to 197 MB.
- **Rotate the Activity secrets**: `DISCORD_CLIENT_SECRET`,
  `SESSION_HMAC_KEY` and `ENGINE_AUTH_TOKEN` from the 2026-08 experiment, or
  delete that app in the developer portal. Deleting the local `.env` did not
  invalidate them.

## Known issues

- **`rpg/proposals.test.ts` is flaky** on a busy machine (found 2026-11-11):
  one test fixes its clock before the records it prunes are stamped, so a
  millisecond's tick fails it, and `npm run check` with it. It failed before
  brief 18 too. The todo `proposals-test-clock` has the fix.

- **`WICKET_URL` in the local `bots/discord/.env` is not a valid URL**
  (found 2026-11-05: the file changed after brief 14 was committed; the
  value has no `http(s)://` in front). `env.ts` throws at import, so a deploy
  with it stops the bot at boot. The tests no longer read it: `npm run
  test:clean` runs them in a copy without the `.env`.
- The local `bots/discord/.env` is production's: the owner restored it on
  2026-11-02 after a day without one, and the deploy pushes it as it is.
  Never edit it or replace it with dev values, and never run the bot,
  `discord:register` or any script that calls `loadEnv()` with it in place:
  they would use the production token, atrium and Wicket. Never run `npm test`
  in the checkout either: two tests import `env.ts`, which reads it.
- `docusaurus.config.ts` has the placeholder `url` `https://example.org` (it
  only feeds the sitemap and og tags), and the site has no favicon.
- `/help`'s Social group is near Discord's 1024-character field limit; the
  next social command spills into a "(cont.)" field by design.
