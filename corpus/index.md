# just-a-bot — corpus index

The front door. Start here, then read **at most 2–3 wiki pages** — triage on the
`summary:` lines below rather than opening pages to find out what's in them.
Needing more than three pages is a signal that a page must split, not a licence
to read on. Conventions: [CLAUDE.md](CLAUDE.md).

- [CLAUDE.md](CLAUDE.md) — corpus schema, conventions, retrieval budget
- [routing.md](routing.md) — which question goes to which layer; intent routing
  for the `orchestrate` skill
- [log.md](log.md) — chronological record of every meaningful change
- [lint.sh](lint.sh) — `bash corpus/lint.sh` health check; `--index` regenerates
  the catalog below
- [../docs/](../docs/README.md) — the *other* layer: per-feature operating
  manuals and setup. `corpus/` is the **why**, `docs/` is the **how**, and
  `docs/` ranks last in the source-of-truth order — see [CLAUDE.md](CLAUDE.md)

## Wiki (synthesis)

<!-- BEGIN GENERATED CATALOG — bash corpus/lint.sh --index -->

- [wiki/architecture.md](wiki/architecture.md) — How the repo and the Discord bot are put together: the three workspaces (two runtime, one docs build), the no-build tsx runtime, one-feature-dir-per-capability layout, and the commands→features→shared dependency direction.
- [wiki/audit-fixes.md](wiki/audit-fixes.md) — What the two 2026-09-26 improvement audits found and how each finding was fixed on 2026-10-02 to 2026-10-07 — crash guard, mention default, timers, trades, atomic JSON writes, the test suite, /help from the registry, quote permissions, date checks, the container's state mounts — with the non-obvious calls and the Discord checks still owed.
- [wiki/code-graph.md](wiki/code-graph.md) — The code-graph layer — what the benchmark measured on this Discord-only repo (impact is exact, transitive and 13.5x cheaper; explore saves only 1.6x; 9 duplicate names conflate) and therefore what it may and may not be trusted for.
- [wiki/decisions-music.md](wiki/decisions-music.md) — The bot's music calls — music was removed and would start from zero, then the Jukebox came back playing from atrium, signed in as the bot's own atrium user. Split out of decisions.md on 2026-11-04.
- [wiki/decisions-removals.md](wiki/decisions-removals.md) — Features deleted outright rather than shelved — /dicetable (2026-08-27), /dnd and /post (2026-10-06) — with the reasons and the owner's follow-ons.
- [wiki/decisions.md](wiki/decisions.md) — Locked tech/design calls with their rejected alternatives and reasons — read before proposing pnpm, a build step, or an ORM-style rewrite.
- [wiki/glossary.md](wiki/glossary.md) — The project's vocabulary — what command, feature dir, sibling command and shelved mean here, plus the Jukebox terms (jukebox, player, track, playlist, queue, bot account) borrowed from atrium, and which synonyms to stop using.
- [wiki/jukebox.md](wiki/jukebox.md) — How the bot's Jukebox works (built 2026-10-09, signing in to atrium's own accounts since 2026-10-13) — the local atrium sign-in, the long-poll link to atrium, the per-guild player and disk buffer, the Speaker seam, atrium's status rules the bot must follow, triage log lines, and the live Discord checks still owed. Atrium's side is atrium's corpus/wiki/jukebox.md.
- [wiki/open-questions.md](wiki/open-questions.md) — The genuinely unresolved threads only — none open as of 2026-10-07.
- [wiki/overview.md](wiki/overview.md) — What just-a-bot is: a personal, feature-rich Discord bot in an npm-workspaces repo (bot, shared library, docs site); the orientation page and the map of what lives where.
- [wiki/status.md](wiki/status.md) — Dated snapshot (2026-11-04) of just-a-bot, per area — the Discord-only bot, deployed as a container with its state outside the mirror (2026-10-07); the 2026-09-26 audit fixes (2026-10-02); the Jukebox built (2026-10-09, atrium's own login 2026-10-13) but not heard in Discord or deployed; the docs site on Docusaurus (2026-10-19, not deployed); the eleven briefs of the 2026-10-20 sweep built on 2026-11-02, not deployed; briefs 12, 13 and 15 built on 2026-11-04 (13 and 15 not deployed), 14 waiting for Wicket; what is left for the owner.

<!-- END GENERATED CATALOG -->

## Work

- [wiki/status.md](wiki/status.md) — dated state per area, open briefs and the
  owner's next steps
- [todos/](todos/) — captured ideas, pre-spec
- [briefs/todo/](briefs/todo/) — numbered specs ready to build, run in number
  order (numbering restarted at 01 on 2026-11-02)
- [briefs/done/](briefs/done/) — completed, immutable
- [briefs/superseded/](briefs/superseded/) — undone or replaced, kept for history
