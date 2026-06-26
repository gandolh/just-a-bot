# Corpus — conventions for `just-a-bot`

This `corpus/` is an LLM-maintained wiki for the project. **Read
[index.md](index.md) first** — it's the front door / content catalog.

The split: the human curates sources and asks questions; the LLM curates the
synthesis (`wiki/`) and tracks the work (`briefs/`, `log.md`).

## Layout

```
corpus/
  CLAUDE.md      this file — schema + conventions
  index.md       content catalog — what lives where
  log.md         chronological record of meaningful changes (newest last)
  routing.md     intent routing for the orchestrate skill
  todos/         captured ideas/tasks as prose (pre-spec)
  briefs/todo|done|superseded/   numbered, immutable work specs
  wiki/          LLM-curated synthesis pages — the knowledge base
```

## Work lifecycle

`todos/<slug>.md` → promote → `briefs/todo/<NN>-<slug>.md` → grill → plan →
implement → `briefs/done/<NN>-<slug>.md` (number kept, immutable) → entry in
`log.md` + fold durable findings into `wiki/`.

## Rules (load-bearing)

- **Brief numbers are stable** — never renumber when a brief moves dirs.
- **Briefs in `done/`/`superseded/` are immutable** — new work = new brief.
- **The LLM owns `wiki/`** — rewrite pages freely as understanding improves;
  synthesis, not transcript. `index.md`/`log.md` are navigation only.
- **Standard relative markdown links**, not `[[wikilinks]]`. Code refs from
  `wiki/` are `../../bots/...`; from `briefs/*/` one level deeper.
- **Absolute dates** (`2026-06-26`), never "yesterday".
- **One concept per file**; split a page past ~200 lines.
- **Source-of-truth order** when sources disagree: (1) actual code, (2) a
  `done/` brief, (3) `decisions.md` over `status.md`, (4) upstream spec.
  Verify any path/function/commit a page names before acting on it.
- **Commit only when the user asks.** One commit per meaningful corpus change.
