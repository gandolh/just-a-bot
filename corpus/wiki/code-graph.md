---
summary: The code-graph layer — what the benchmark measured on this Discord-only repo (impact is exact, transitive and 13.5x cheaper; explore saves only 1.6x; 12 duplicate names conflate) and therefore what it may and may not be trusted for.
updated: 2026-08-27
---

# Code graph (the *what* layer)

The corpus answers **why** the code is the way it is. Structural questions —
"who calls X", "what breaks if I change X" — belong to a **generated** symbol
index, never to this wiki. This page records what that index is worth here.

Tool: `@colbymchenry/codegraph@1.6.0`, `tree-sitter` + a heuristic resolver,
**not a compiler**. Generated, gitignored, disposable, and **never a source of
truth** — its output must not be written into a wiki page as fact.

- Installed **globally** (`npm i -g @colbymchenry/codegraph@1.6.0`), not as a
  devDependency: the payload is ~279 MB of vendored Node + prebuilt per-platform
  binary, and it does not belong in this repo's lockfile.
- MCP server registered in the committed `.mcp.json` so it is available without a
  per-machine setup step. `npm run codegraph:init` builds the index,
  `npm run codegraph:sync` refreshes it after a pull.
- The server lists **only `codegraph_explore`** by default — the query that
  measured worst here — so `.mcp.json` sets
  `CODEGRAPH_MCP_TOOLS=explore,impact,callers,node` to expose the ones that
  measured well. It also pins behavior with `CODEGRAPH_NO_DOWNLOAD=1` (no
  GitHub-Releases binary fallback), `CODEGRAPH_NO_UPDATE_CHECK=1`, and
  `CODEGRAPH_TELEMETRY=off`.
- Backend must report `node:sqlite`; the WASM fallback is 5–10× slower.
- Index at benchmark time: 1,257 nodes, 3,422 edges, built in 709 ms (re-indexed
  2026-08-27 after the Slack/WhatsApp/dice-activity removal).

## What the benchmark measured (2026-08-27)

Re-measured after the repo became Discord-only — the first run's two headline
findings both involved files that no longer exist, so those numbers are void.
Graph vs `grep` as ground truth.

| Oracle                                                   | Graph | grep truth | Verdict |
| -------------------------------------------------------- | ----- | ---------- | ------- |
| **Barrel impact** — `loadEnv`, defined in `shared/src/env.ts`, re-exported via `shared/src/index.ts`, consumed in `bots/discord` | 3 files, incl. the barrel edge | 3 | **exact** |
| **Transitive impact** — `MOB_KINDS` in `rpg/world.ts`     | 6 files | 3 direct references | **correct superset, 0 misses** |
| **Caller recall** — `logger`                              | 11 caller files | 11 genuine callers | **100% on the current tree** |
| **Duplicate names** within `bots/discord`                 | merges definitions | 12 names exported twice+ | **conflates** |

Context cost, same question asked both ways:

| Question                            | Graph     | Read the files | Saving    |
| ----------------------------------- | --------- | -------------- | --------- |
| blast radius of `loadEnv`           | 193 B     | 2,602 B        | **13.5×** |
| orient me in the `gambling` feature | 15,892 B  | 25,160 B       | **1.6×**  |

## What that means here

**`impact` is the query that justifies the layer.** It was exact on the barrel
oracle, and on `MOB_KINDS` it returned a correct **superset** of grep — six files
where grep finds three, because `rpg-buttons.ts`, `rpg.ts` and `encounter.ts`
never name the symbol but would still be affected by changing it. That transitive
reach is the thing grep genuinely cannot do, and it comes at 13.5× less context.

**`explore` still does not earn its keep.** 1.6× is noise; reading the feature
dir is exact and barely larger. This repo is thin, mostly independent feature
dirs — there is little structure for a graph to compress.

**Caller recall is 100% on the current tree — but do not read that as "fixed".**
The undercount measured in the first run
(`bots/whatsapp/src/reminders/tick.ts` <!-- stale-ok -->, absent from
`callers logger` despite identical import syntax to files that were found) is no
longer reproducible
because that file was **deleted**, not because the resolver improved. The
evidence disappeared; the heuristic did not change. Treat `callers` as "no
undercount currently observable", not as complete.

**Never rename off the graph.** 12 names are exported more than once inside
`bots/discord` — `applyGuess` alone is defined in both `hangman/game.ts` and
`wordle/game.ts`, and `callers applyGuess` returns callers of both as one
undifferentiated list. It unions rather than distinguishing, so the result looks
complete and is not. This was 32 names when Slack was in the repo; removing Slack
reduced it but did **not** eliminate it — the conflation was never purely
cross-workspace. `grep -rnw` and confirm each hit.

The per-query rules, the full duplicate-name list, and the regeneration command
live in the project skill at `.claude/skills/codegraph/SKILL.md` — that is the
page an agent should read before querying. Routing:
[routing.md](../routing.md).

## Refreshing the duplicate-name list

After adding or renaming a feature, regenerate:

```bash
grep -rhoE "^export (async function|function|class|const|interface|type) [A-Za-z0-9_]+" \
  bots/discord --include=*.ts | awk '{print $NF}' | sort | uniq -d
```
