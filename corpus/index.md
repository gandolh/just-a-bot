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
- [wiki/code-graph.md](wiki/code-graph.md) — The code-graph layer — what the benchmark measured on this Discord-only repo (impact is exact, transitive and 13.5x cheaper; explore saves only 1.6x; 9 duplicate names conflate) and therefore what it may and may not be trusted for.
- [wiki/decisions-removals.md](wiki/decisions-removals.md) — Features deleted outright rather than shelved — /dicetable (2026-08-27), /dnd and /post (2026-10-06) — with the reasons and the owner's follow-ons.
- [wiki/decisions.md](wiki/decisions.md) — Locked tech/design calls with their rejected alternatives and reasons — read before proposing pnpm, a build step, or an ORM-style rewrite.
- [wiki/glossary.md](wiki/glossary.md) — The project's vocabulary — what command, feature dir, sibling command and shelved mean here, plus the Jukebox terms (jukebox, player, track, playlist, queue, bot account) borrowed from atrium, and which synonyms to stop using.
- [wiki/jukebox.md](wiki/jukebox.md) — How the bot's Jukebox works (briefs 25-27) — the Ward sign-in, the long-poll link to atrium, the per-guild player and disk buffer, the Speaker seam, atrium's status rules the bot must follow, triage log lines, and the live Discord checks still owed. Atrium's side is atrium's corpus/wiki/jukebox.md.
- [wiki/open-questions.md](wiki/open-questions.md) — The genuinely unresolved threads only — none open as of 2026-10-07.
- [wiki/overview.md](wiki/overview.md) — What just-a-bot is: a personal, feature-rich Discord bot in an npm-workspaces repo (bot, shared library, docs site); the orientation page and the map of what lives where.
- [wiki/status.md](wiki/status.md) — Dated snapshot of where the project stands right now — a single Discord bot whose music (the Jukebox, playing atrium's library) is being built in briefs 25-27 (25 and 26 done; nothing heard in Discord yet), /dicetable removed, and 21 audit briefs (04-24) queued from two passes, in rank order.

<!-- END GENERATED CATALOG -->

## Work

- [wiki/status.md](wiki/status.md) — the brief/area catalog and current state
  (this page does **not** duplicate it)
- [todos/](todos/) — captured ideas, pre-spec
- [briefs/todo/](briefs/todo/) — numbered specs ready to build
- [briefs/done/](briefs/done/) — completed, immutable
- [briefs/superseded/](briefs/superseded/) — undone or replaced, kept for history
