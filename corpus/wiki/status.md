---
summary: Dated snapshot (2026-11-02) of just-a-bot, per area — the Discord-only bot, deployed as a container with its state outside the mirror (2026-10-07); the 2026-09-26 audit fixes (2026-10-02); the Jukebox built (2026-10-09, atrium's own login 2026-10-13) but not heard in Discord or deployed; the docs site on Docusaurus (2026-10-19, not deployed); the eleven briefs of the 2026-10-20 sweep built on 2026-11-02, not deployed; what is left for the owner.
updated: 2026-11-04
---

# Status — 2026-11-02

`origin/main` is at `523dfe9`; the local commits after it (`aad247f`, the
briefs reset and the 2026-11-02 brief run) are not pushed. Typecheck is clean
and `npm test` passes 104 tests (99 in the bot, 5 in `shared`). Production runs the 2026-10-07
container. Brief numbering restarted at 01 on 2026-11-02 (see
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
- **Music: the Jukebox** (built 2026-10-09). The bot plays atrium's library in
  voice, steered by atrium over a long-poll; `/jukebox` is the Discord remote.
  Since 2026-10-13 it signs in as a local atrium user with the `jukebox` role,
  not a Ward account. Run against a local atrium with a stand-in speaker; **not
  heard in Discord and not deployed** ([jukebox.md](jukebox.md)).
- **Docs site** (2026-10-19). `docs-site/` renders `docs/` and `corpus/` with
  Docusaurus at `/just-a-bot/docs`; the rendered pages are generated on every
  build and gitignored. `vps-deploy` flipped the stack to Docusaurus the same
  day; **not deployed**.
- **Knowledge layers.** Root `CLAUDE.md` points at the corpus; `docs/` is the
  how and ranks last; the code graph is installed for impact queries only
  ([code-graph.md](code-graph.md)).
- **Rest of the bot.** Games, gambling, AI chat, image cards, reminders, RPG,
  quotes and confessions work as before. They have no wiki pages; their
  manuals are under [`docs/discord/`](../../docs/discord/README.md).

## Open briefs

12, the RPG manual matches the commands (written 2026-11-03 from its todo, in
a grill with the owner; not started). 13 and 14, written 2026-11-04 from a grill with the owner, not
started: 13 `/ask` always uses `OLLAMA_MODEL` (no model option) and fails
privately; 14 `/ask` goes through Wicket, the estate's new LLM queue, once
Wicket is deployed. 15, also 2026-11-04: the container starts the bot with `node` and tsx's
loader directly, not through `npm` (the owner's memory review of the VPS). The eleven briefs from the 2026-10-20 improvement sweep were built on
2026-11-02, one commit each plus a corpus commit (see [`../log.md`](../log.md)):
01-05 the Jukebox's failure paths, checked against atrium's source, 06-09 the
Now items (shutdown drain, private-thread quotes, RPG names, the `/confess`
race), 10-11 the Next items (RPG proposals and pruning, `/ask` limits). None of
it is deployed or run in Discord. No todo is open.

## Next (owner)

- **The Jukebox in production**, in order: seed a `jukebox` user in atrium;
  put `JUKEBOX_ATRIUM_URL`, `JUKEBOX_ATRIUM_USERNAME` and
  `JUKEBOX_ATRIUM_PASSWORD` in the server's `.env` and drop the old
  `JUKEBOX_WARD_*` names (a partial set stops the bot at boot, naming what is
  missing); deploy atrium, then the bot;
  remove the bot's old `atrium` grant at Ward.
- **Hear it in Discord**: the checks in [jukebox.md](jukebox.md), on a dev
  application or after the deploy.
- **Deploy the docs site** from `vps-deploy`.
- **The 2026-10-02 fixes in Discord**: the list at the end of
  [audit-fixes.md](audit-fixes.md).
- **The 2026-11-02 briefs in Discord** (each brief's outcome has its check):
  `/jukebox play` from a channel without Speak is refused (01); a song atrium
  cannot serve is skipped once, not twice (02); a slow `/jukebox skip` stays
  visible to a second account (05); `/quote add` into a private thread you are
  not in is refused (07); a duel challenge notifies the defender once (08, 10);
  `/ask` refuses a second question in flight (11).
- **Rotate the Activity secrets**: `DISCORD_CLIENT_SECRET`,
  `SESSION_HMAC_KEY` and `ENGINE_AUTH_TOKEN` from the 2026-08 experiment, or
  delete that app in the developer portal. Deleting the local `.env` did not
  invalidate them.

## Known issues

- The local `bots/discord/.env` is production's: the owner restored it on
  2026-11-02 after a day without one, and the deploy pushes it as it is.
  Never edit it or replace it with dev values, and never run the bot,
  `discord:register` or any script that calls `loadEnv()` with it in place:
  they would use the production token, atrium and Ollama. Unit tests that
  import `env.ts` read it but make no network calls.
- `docusaurus.config.ts` has the placeholder `url` `https://example.org` (it
  only feeds the sitemap and og tags), and the site has no favicon.
- `/help`'s Social group is near Discord's 1024-character field limit; the
  next social command spills into a "(cont.)" field by design.
