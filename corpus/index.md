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

- [wiki/architecture.md](wiki/architecture.md) — How the monorepo and the Discord bot are put together: workspaces, the no-build tsx runtime, one-feature-dir-per-capability layout, and the commands→features→shared dependency direction.
- [wiki/code-graph.md](wiki/code-graph.md) — The code-graph layer — what the 2026-08-27 benchmark measured on this repo (impact is exact and 13x cheaper; explore saves only 1.2x; callers undercounts; 32 names conflate) and therefore what it may and may not be trusted for.
- [wiki/decisions.md](wiki/decisions.md) — Locked tech/design calls with their rejected alternatives and reasons — read before proposing pnpm, a build step, an ORM-style rewrite, or a different music source.
- [wiki/glossary.md](wiki/glossary.md) — The project's vocabulary — what command, feature dir, provider, extractor, sibling command and shelved mean here, and which synonyms to stop using.
- [wiki/music.md](wiki/music.md) — How the /play music stack works and why it is currently shelved: provider choice (SoundCloud vs the disabled YouTube path), the skipFFmpeg requirement, the VPS IP-block saga, and audio-quality settings.
- [wiki/open-questions.md](wiki/open-questions.md) — The genuinely unresolved threads only — what is still undecided about yt-dlp freshness and Opus passthrough.
- [wiki/overview.md](wiki/overview.md) — What just-a-bot is: a personal npm-workspaces monorepo whose flagship is a feature-rich Discord bot; the orientation page and the map of what lives where.
- [wiki/status.md](wiki/status.md) — Dated snapshot of where the project stands right now — one line per area, notably that the music feature is shelved and why.

<!-- END GENERATED CATALOG -->

## Work

- [wiki/status.md](wiki/status.md) — the brief/area catalog and current state
  (this page does **not** duplicate it)
- [todos/](todos/) — captured ideas, pre-spec
- [briefs/todo/](briefs/todo/) — numbered specs ready to build
- [briefs/done/](briefs/done/) — completed, immutable
- [briefs/superseded/](briefs/superseded/) — undone or replaced, kept for history
