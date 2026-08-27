---
title: Stand up the code-graph layer (the "what" half of corpus-flow §0b)
created: 2026-08-27
status: done
tags: [corpus, tooling, codegraph]
---

# Stand up the code-graph layer

> **Done 2026-08-27.** Installed `@colbymchenry/codegraph@1.6.0` globally (not as
> a devDependency — the payload is ~279 MB), committed `.mcp.json`, added
> `codegraph:init`/`codegraph:sync`, benchmarked, and wrote the envelope to
> [wiki/code-graph.md](../wiki/code-graph.md) +
> `.claude/skills/codegraph/SKILL.md`.
>
> **Outcome: kept, but narrower than the spec assumes.** `impact` is exact and
> 12.9× cheaper than reading the files — that earns the layer. `explore` saves
> only 1.2× on this repo, so the "orient me in a feature" use case is explicitly
> ruled out in favour of reading the feature dir. The prediction below — that a
> repo of thin independent feature dirs is where a graph helps least — was
> half right: it holds for `explore`, not for `impact`.

The corpus is the **why** layer. corpus-flow §0b pairs it with a generated
**code graph** — a tree-sitter symbol index served over MCP — for the structural
questions the wiki must never answer: "who calls X", "what breaks if I change
Y", "first map of an unfamiliar feature". Without it those questions cost a grep
sweep and a pile of file reads before any real work starts.

Not installed here. [routing.md](../routing.md) currently routes structural
questions to `grep` + read, which is correct but expensive.

## Context

Deliberately deferred when the corpus was updated to corpus-flow 0.29.0
(2026-08-27) — standing it up means adding a pinned third-party dependency and
committing an MCP registration, which is a real change to the repo rather than a
documentation update, and worth its own decision.

Weigh before doing it:

- `@colbymchenry/codegraph` is MIT but effectively single-maintainer — a
  supply-chain surface. Pin it.
- This repo is ~19 feature dirs of thin, mostly-independent modules with a
  commands → features → `@bots/shared` dependency direction. The blast radius of
  a change is usually one feature dir, which is exactly the case a graph helps
  *least*. The payoff is smaller here than in a tangled codebase.
- `bots/dice-activity` is the one workspace with a build and a web client, so
  the graph's accuracy envelope will differ across workspaces.

## What to do

Follow the personal `codegraph` skill for the method (pinned install, `init`,
telemetry off, native backend, gitignore `.codegraph/`, **run its benchmark**).
Then the corpus-side wiring:

1. Commit the MCP registration into `.mcp.json` with an env-overridable index
   path (`serve --mcp --no-watch --path ${CODEGRAPH_INDEX_PATH:-<dir>}`) — a
   per-dev manual `codegraph install` step never gets run and the layer dies.
2. Add root scripts (`codegraph:init` / `codegraph:sync`) so onboarding is one
   line.
3. Write `.claude/skills/codegraph/SKILL.md` with the **measured** per-repo
   envelope: a *use it for* table and an explicit *do NOT use it for* list
   (renames and "every usage" → `grep -rnw`; the duplicate-name conflations the
   benchmark surfaces).
4. File the benchmark as `corpus/wiki/code-graph.md` and replace the
   "no code graph installed" rows in [routing.md](../routing.md).

## Acceptance

A fresh session can ask "who calls X" and get a graph answer without a manual
setup step; the measured envelope — including what the graph gets *wrong* here —
is written down in the corpus and the project skill. If the benchmark shows the
graph doesn't beat `grep` on this repo's shape, record that finding and close the
todo without installing — that is a valid outcome.
