# Routing profile — just-a-bot

Read by the `orchestrate` skill (the work-intake front door), and by any agent
deciding **where to look** before it starts reading files.

## Knowledge routing — question shape → layer

The corpus is the **why** (decisions, intent, history). It is the wrong tool for
the **what** ("who calls X", "where does Y live"). Route each question to its own
layer instead of grepping twenty files or asking the wiki a structural question.

| Question shape                                        | Layer                                                        |
| ----------------------------------------------------- | ------------------------------------------------------------ |
| "why is it like this", "was this decided"              | `wiki/decisions.md` → `log.md`                               |
| "where do things stand", "what's shipped"              | `wiki/status.md`                                             |
| "why is there no music"                                 | `wiki/decisions.md`                                          |
| "what is a *feature dir* / *shelved*"                  | `wiki/glossary.md`                                           |
| "how is the repo put together"                         | `wiki/architecture.md`                                       |
| "how do I set this feature up / what env vars"          | [`docs/`](../docs/README.md) — the how-layer, verify against code |
| "how do I triage this feature when it breaks"           | that feature's `docs/` runbook, then `pm2 logs`              |
| "where does feature Y live"                            | `bots/discord/src/<feature>/` + its `commands/<name>.ts` — the layout is one dir per feature, so this is a directory listing, not a search |
| "what breaks if I change X" (blast radius)              | `codegraph impact <symbol>` — measured **exact** here. See [wiki/code-graph.md](wiki/code-graph.md) |
| "who calls X"                                          | `codegraph callers <symbol>` for scoping — **~95% recall**, complete with grep before acting |
| "did I get *every* usage" (rename, deletion)           | `grep -rnw` over `bots/ shared/` — **never** the graph: it unions the 12 names exported twice inside `bots/discord` |
| "orient me in feature Y"                               | read `bots/discord/src/<feature>/` — the graph's `explore` saves only 1.2× here, so it isn't worth it |
| "does it still work"                                   | `npm run typecheck`; run the bot (`npm run discord:dev`)     |
| a path/function/commit a wiki page names               | verify it exists before acting — pages drift                 |

## Skills

- **Implement skill:** plan-split-dispatch (for ≥3 independent chunks; else inline)
- **Review skill:** code-review
- **PR skill:** _none configured — user opens PRs manually_

## Intent routing

| If the request is…                                  | Route to                          |
| --------------------------------------------------- | --------------------------------- |
| capture an idea / "add a todo"                       | corpus-flow §1                    |
| "work on brief NN" / build a feature                 | corpus-flow §3 → plan-split-dispatch |
| "what does the wiki say about X"                     | corpus-flow §5 (query)            |
| "lint the corpus" / "is the wiki stale"              | `bash corpus/lint.sh`, then corpus-flow §7 |
| review a diff/PR                                     | code-review skill                 |
| building music                                       | nothing yet — the owner writes the brief when it is time |

## READ / SKIP / SKILLS

| Area               | READ                                             | SKIP                  |
| ------------------ | ------------------------------------------------ | --------------------- |
| A Discord command  | bots/discord/src/commands/<name>.ts + its feature dir under src/ | unrelated feature dirs |
| Shared utils       | shared/ (`@bots/shared`: logger, loadEnv)        | —                     |
| Env / config       | bots/discord/src/env.ts, ecosystem.config.cjs    | —                     |

No `test-plans/` layer: the Discord bot has no browser UI worth walking. The one
web app in the repo (`dice-activity`) was removed on 2026-08-27, so there is
nothing to drive in a browser at all.
