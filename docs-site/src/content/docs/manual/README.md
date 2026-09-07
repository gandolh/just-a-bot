---
title: "Docs"
tableOfContents:
  maxHeadingLevel: 3
---

:::note[Rendered from `docs/README.md`]
Generated on every docs build. Edit the source in `docs/`, not here.
:::
Project documentation, organized by where the code lives. Written for future me.

## This is the *how*, not the *why*

`docs/` is the **operating manual**: what a feature does, how to set it up, which
env vars it needs, how to triage it when it breaks. It is written once per
feature and revisited when that feature changes.

The **why** lives in [`corpus/`](../corpus/index.md) — locked decisions with
their reasons, dated status, open questions, and the todos → briefs → done work
lifecycle. It is updated as work lands, so when the two disagree **the corpus
wins** (and below it, the code wins over both). A `docs/` claim about current
behavior is a lead, not a fact.

If you are an agent orienting in this repo, start at
[corpus/index.md](../corpus/index.md), not here.

## Sections

- **[Common](common/)** — repo-wide patterns
  - [Architecture](common/architecture.md) — workspaces, runtime, shared package, persistence philosophy
  - [Setup](common/setup.md) — install + typecheck
- **[Discord bot](discord/)** — `bots/discord/`, all features
  - [Index](discord/README.md) · [Architecture](discord/architecture.md) · [Setup](discord/setup.md)

The split mirrors the source tree: anything Discord-specific lives under
`discord/`; anything repo-wide lives under `common/`.
