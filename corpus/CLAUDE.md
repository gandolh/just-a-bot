# Corpus — conventions for `just-a-bot`

This `corpus/` is an LLM-maintained wiki for the project. **Read
[index.md](index.md) first** — it is the front door and the content catalog.

The split: the human curates sources and asks questions; the LLM curates the
synthesis (`wiki/`) and tracks the work (`briefs/`, `log.md`). Reusable findings
get folded back in here — not left in chat or in personal memory.

## Layout

```
corpus/
  CLAUDE.md      this file — schema + conventions
  index.md       content catalog — generated from each wiki page's `summary:`
  routing.md     question shape → layer, plus intent routing for `orchestrate`
  lint.sh        health check (frontmatter, links, page size, stale paths)
  log.md         chronological record of meaningful changes (newest last)
  todos/         captured ideas/tasks as prose (pre-spec)
  briefs/todo|done|superseded/   numbered, immutable work specs
  wiki/          LLM-curated synthesis pages — the knowledge base
```

No `test-plans/` layer — see the note at the bottom of [routing.md](routing.md).

## The other documentation layer: `docs/`

The repo also has [`docs/`](../docs/README.md) — 29 files of per-feature
operating manual (what a feature does, its env vars, setup steps, triage
runbooks). It predates this corpus. **The split is why vs how:**

- `corpus/` owns **why** — decisions + reasons, dated status, open questions, the
  work lifecycle, subsystem synthesis. Updated as work lands.
- `docs/` owns **how to use and set up** — written once per feature, revisited
  when that feature changes.

Consequences for an agent:

- Never record a decision only in `docs/` — a decision that isn't in
  [decisions.md](wiki/decisions.md) will be relitigated.
- `docs/` ranks **below** the corpus in the source-of-truth order below, because
  it goes stale quietly. Treat a `docs/` claim about current behavior as a lead
  to verify, not a fact.
- When work changes how a feature is *used or set up*, update `docs/` too. The
  corpus is not a replacement for it.

## The retrieval budget (a rule, not advice)

A corpus exists to make an agent **cheaper**, not just better-informed.

1. Read [index.md](index.md). Then read **at most 2–3 wiki pages**.
2. Needing more than three is a **signal**: a page is straddling topics and must
   split, or its `summary:` isn't sharp enough. Fix the cause; don't read on.
3. Never read `briefs/` or `todos/` wholesale. [wiki/status.md](wiki/status.md)
   holds each brief's state in one line — open a brief only for the spec that
   directed specific work.
4. Prefer a page's `summary:` line over opening the page. That is what it's for.

## The wiki spine

- [overview.md](wiki/overview.md) — what this project *is*. Short, stable.
- [architecture.md](wiki/architecture.md) — how it's put together.
- [decisions.md](wiki/decisions.md) — **locked** calls, so briefs and reviews
  don't relitigate them. An entry earns its place only if it is hard to reverse,
  surprising without context, **and** a genuine trade-off; format is the call,
  the date, the rejected alternatives, and the **reason** (the load-bearing
  part). Changing one needs an explicit revisit + a `log.md` note.
- [status.md](wiki/status.md) — a **dated** snapshot; one terse line per area.
  Detail is pushed down to the brief and to `log.md`, never duplicated.
- [open-questions.md](wiki/open-questions.md) — only the genuinely unresolved.
  Delete an entry the moment it's answered; its history lives in `log.md`.
- [glossary.md](wiki/glossary.md) — one canonical definition per project-specific
  term, each listing the synonyms it displaces (`_Avoid_:` is the half that
  actually stops drift). Definitions, not mechanism. Write an entry the moment a
  term is settled. A term used against its definition is a **finding**, not a
  typo; two live meanings means two terms and two names.
- Plus one page per meaningful subsystem, added as work touches it.

## Work lifecycle

`todos/<slug>.md` → promote → `briefs/todo/<NN>-<slug>.md` → grill → plan →
implement → `briefs/done/<NN>-<slug>.md` (number kept, immutable) → entry in
`log.md` + fold durable findings into `wiki/`.

`log.md` entry kinds: `done`, `todo`, `maintenance`, `incident`, `decision`,
`ingest`, `lint`, `resume`. A **`resume`** entry is the cold-start checkpoint
written when a long run is paused (what's done, what's next, branch + last
commit, open decisions).

## Rules (load-bearing)

- **Brief numbers are stable** — never renumber when a brief moves dirs.
- **Briefs in `done`/`superseded` are immutable** — new work = new brief. An
  outcome note is appended at move time only.
- **Every wiki page carries `summary:` + `updated:` frontmatter**, and
  `index.md`'s catalog is **generated** from it — `bash corpus/lint.sh --index`.
  Never hand-maintain the catalog; never let `index.md` duplicate a list another
  page owns (the brief catalog belongs to `status.md`).
  Write `summary:` for an agent deciding whether to open the page, not as a title.
- **The retrieval budget above is enforced**, not aspirational.
- **The LLM owns `wiki/`** — rewrite pages freely as understanding improves;
  synthesis, not transcript. `index.md`/`log.md` are navigation only.
- **The corpus is the *why*; the code graph is the *what*.** Never answer a
  structural question ("who calls X") from the wiki — route it per
  [routing.md](routing.md). A code graph is installed (see
  [wiki/code-graph.md](wiki/code-graph.md) for what it may be trusted for, and
  `.claude/skills/codegraph/SKILL.md` for the per-query rules). Its output is a
  lookup, **never a finding** — do not write it into a wiki page as fact, and
  never rename off it.
- **Standard relative markdown links**, not `[[wikilinks]]`. Code refs from
  `wiki/` are `../../bots/...`; from `briefs/*/` one level deeper.
- **Absolute dates** (`2026-08-27`), never "yesterday".
- **One concept per file**; split a page past ~200 **body** lines (frontmatter
  excluded) or the moment it straddles two topics.
- **Verify before quoting.** A page naming a path, function, or commit may have
  drifted — check it exists before acting on it, and fix the page if it's stale.
- **Source-of-truth order** when sources disagree: (1) actual code, (2) a
  `done/` brief, (3) `decisions.md` over `status.md`, (4) upstream spec,
  (5) `docs/` last.
- **`bash corpus/lint.sh` before a corpus commit.** It exits non-zero on missing
  frontmatter, broken links, oversized pages, stale repo paths, and orphans.
- **`TodoWrite` is the in-session list; `corpus/` is durable.** Don't conflate
  them, and prefer the corpus over personal memory for project knowledge.
- **Commit only when the user asks.** One commit per meaningful corpus change.
