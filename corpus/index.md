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

- [wiki/architecture.md](wiki/architecture.md) — How the repo and the Discord bot are put together: the two workspaces, the no-build tsx runtime, one-feature-dir-per-capability layout, and the commands→features→shared dependency direction.
- [wiki/code-graph.md](wiki/code-graph.md) — The code-graph layer — what the benchmark measured on this Discord-only repo (impact is exact, transitive and 13.5x cheaper; explore saves only 1.6x; 9 duplicate names conflate) and therefore what it may and may not be trusted for.
- [wiki/decisions-superseded.md](wiki/decisions-superseded.md) — Decisions that no longer bind — the music-provider trail (SoundCloud primary, then shelved, then the yt-dlp-only scope) kept for its reasoning, not as a live constraint.
- [wiki/decisions.md](wiki/decisions.md) — Locked tech/design calls with their rejected alternatives and reasons — read before proposing pnpm, a build step, an ORM-style rewrite, or a different music source.
- [wiki/glossary.md](wiki/glossary.md) — The project's vocabulary — what command, feature dir, sibling command and shelved mean here, and which synonyms to stop using.
- [wiki/music.md](wiki/music.md) — Post-mortem of the removed /play music subsystem — every provider tried and how each failed from a datacenter IP, plus the hard-won settings (skipFFmpeg, volume, format) any future attempt must not rediscover.
- [wiki/open-questions.md](wiki/open-questions.md) — The genuinely unresolved threads only — currently why /dnd and /post are hidden and what should happen to them.
- [wiki/overview.md](wiki/overview.md) — What just-a-bot is: a personal, feature-rich Discord bot in a two-workspace npm repo; the orientation page and the map of what lives where.
- [wiki/status.md](wiki/status.md) — Dated snapshot of where the project stands right now — a single Discord bot with music and /dicetable both removed, and no work queued.

<!-- END GENERATED CATALOG -->

## Work

- [wiki/status.md](wiki/status.md) — the brief/area catalog and current state
  (this page does **not** duplicate it)
- [todos/](todos/) — captured ideas, pre-spec
- [briefs/todo/](briefs/todo/) — numbered specs ready to build
- [briefs/done/](briefs/done/) — completed, immutable
- [briefs/superseded/](briefs/superseded/) — undone or replaced, kept for history
