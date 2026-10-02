# Task 12 — Corpus and root CLAUDE.md: remove claims that later changes made false

## Context

Source: the 2026-09-26 improvements audit, recorded in [log.md](../../log.md).
Rank 9 of 16.

Four changes made parts of the corpus false:

- the 2026-08-27 removals of music and `/dicetable`
- the Docker image added on 2026-09-06 (commit `53a5cbb`)
- `docs-site/`, added 2026-09-07 (log entry "A documentation site at
  `/just-a-bot/docs`")

`bash corpus/lint.sh` still passes, because it checks structure and not facts. An
agent orienting from the corpus's own front doors gets the wrong repo shape.

1. **`corpus/wiki/architecture.md` contradicts itself.**
   - Lines 59-61 say the audio stack is gone.
   - "Dependency direction" (`:63-67`) still describes `player.ts`, `initPlayer`
     and `getPlayer()`.
   - Line 48 says `index.ts` "wires up commands and the player".
   - Lines 11-14 and 19 justify the `shared/` workspace with the dice-table wire
     protocol, which was deleted along with `/dicetable` (brief 02).
2. **"Two workspaces" is wrong in four places.** Root `CLAUDE.md:3`,
   `architecture.md:8-14`, and `overview.md:2`, `:16` and `:21-22` all say two npm
   workspaces. Root `package.json:8-12` lists three.
3. **Stale maintenance note.** The "Maintenance note" in
   `corpus/wiki/status.md:84-87` says to keep the bundled yt-dlp binary current.
   yt-dlp, its package and its update script were all removed on 2026-08-27
   ([decisions.md](../../wiki/decisions.md), "Music subsystem removed entirely").
4. **"Nothing builds" is now narrowly false.** The root `CLAUDE.md` says "No build
   step, anywhere." The `decisions.md` entry "No build step" ends with "Nothing in
   the repo builds." Both are now false, because `docs-site` runs `astro build`.
   The bot itself still has no build. Scope both claims to the bot and name
   `docs-site` as the one static-site build. Don't reopen the decision.
5. **`status.md` is out of date.** It's dated 2026-08-27, and its Tooling section
   doesn't mention the docs site.

## Files you OWN

- `CLAUDE.md` (repo root)
- `corpus/wiki/architecture.md`
- `corpus/wiki/overview.md`
- `corpus/wiki/status.md`, except "Queued work", which tracks the brief catalog
- `corpus/wiki/decisions.md`, the "No build step" entry only
- `corpus/index.md`, the generated catalog only, via `lint.sh --index`
- `corpus/log.md` (append)

## Files you must NOT touch

- The pm2 entry in `decisions.md`. Brief 07 owns it, and that's also where the
  live deploy path gets recorded.
- `docs/`. Brief 11 covers it.
- Lines marked `<!-- stale-ok -->`. Those are deliberate history.

## What to do

1. Fix each item above. When you rewrite the `shared/` justification, keep it
   accurate. `shared/` now holds the logger, `loadEnv`, and reminder
   parse/store. It stays a separate workspace so the "no `discord.js` here" rule
   is enforced mechanically (`status.md` "Scope" already says this).
2. Describe `docs-site` in `architecture.md`'s layout block and `overview.md`'s
   structure line. It's a build-time docs workspace, not a runtime.
3. Refresh `status.md`'s date and its Tooling section. If brief 07 hasn't landed
   yet, add a pointer to it for the deploy path.
4. Run `bash corpus/lint.sh --index` to regenerate the catalog, since the summary
   lines change. Then run `bash corpus/lint.sh`.
5. Append a `maintenance` entry to `log.md`.

## Acceptance

- `grep -n "player\|initPlayer\|dice-table\|yt-dlp" corpus/wiki/architecture.md corpus/wiki/status.md`
  returns nothing, or only lines marked `<!-- stale-ok -->`.
- No page in `corpus/wiki/`, and not the root `CLAUDE.md`, says "two workspaces"
  or "two-workspace".
- `bash corpus/lint.sh` clean.

## Outcome (2026-10-02)

All five items fixed:
- `architecture.md` drops the player (bootstrap line, dependency direction) and
  the dice-table wire protocol. It justifies `shared/` by the
  no-`discord.js` boundary and lists `docs-site/` and `infrastructure/` in the
  layout.
- "Two workspaces" is gone from the root `CLAUDE.md`, `architecture.md` and
  `overview.md`.
- The yt-dlp maintenance note is deleted from `status.md`.
- "Nothing builds" is scoped to the bot in `CLAUDE.md`, `architecture.md` and
  the `decisions.md` "No build step" entry, each naming `docs-site`'s
  `astro build` as the one build. The decision is not reopened.
- `status.md` is dated 2026-10-02, and its Tooling section gains the docs site
  and the container image, pointing at briefs 07 and 20 for the deploy path.

One edit outside the "No build step" entry: the 2026-08-27 Discord-only entry's
"**Two workspaces, not one.**" bullet is dated history, so it is marked
`<!-- stale-ok -->` with a one-line note about `docs-site` and the deleted
protocol, rather than rewritten.

Verified: the acceptance grep returns only that `stale-ok` line and the brief
catalog line in "Queued work" that describes this brief itself. `bash
corpus/lint.sh --index` and `bash corpus/lint.sh` are clean. Moving brief 11
had broken a relative link in brief 22, which is fixed.
