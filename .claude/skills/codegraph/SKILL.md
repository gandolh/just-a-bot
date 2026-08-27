---
name: codegraph
description: How far to trust the code graph in THIS repo (just-a-bot, Discord-only) — the measured accuracy envelope, the queries it wins on, and the ones where it is unsafe or simply not worth it. Use when asked for impact/blast radius, callers/callees, "what breaks if I change X", "every usage of X", or when planning a rename.
---

# codegraph — the measured envelope for just-a-bot

The method (graph to locate and scope, grep to confirm and be exhaustive) lives
in the personal `codegraph` skill. **This page is only the numbers measured on
this repo**, because those don't transfer.

Setup: `@colbymchenry/codegraph@1.6.0`, installed **globally** (`npm i -g`, ~279 MB
of vendored Node + prebuilt binary — deliberately kept out of this repo's
`package.json` and lockfile). MCP is registered in the committed
[`.mcp.json`](../../../.mcp.json). Index: `npm run codegraph:init` to build,
`npm run codegraph:sync` after pulling.

**MCP surface:** the server lists only `codegraph_explore` by default — the one
query that measured *worst* here. `.mcp.json` therefore sets
`CODEGRAPH_MCP_TOOLS=explore,impact,callers,node`, so
`codegraph_impact` / `codegraph_callers` / `codegraph_node` are available as
tools instead of only via the CLI. It also sets `CODEGRAPH_NO_DOWNLOAD=1` (never
fetch a binary from GitHub Releases as a fallback — run only the pinned,
registry-installed artifact), `CODEGRAPH_NO_UPDATE_CHECK=1`, and
`CODEGRAPH_TELEMETRY=off`. `.codegraph/` is gitignored and
disposable. Backend must report `node:sqlite`, not WASM.

Repo at index time: 1,257 nodes, 3,422 edges, 709 ms to build (re-indexed
2026-08-27, after Slack/WhatsApp/dice-activity were removed).

## Use it for

| Query                       | Measured on this repo                                                                          |
| --------------------------- | ---------------------------------------------------------------------------------------------- |
| `codegraph impact <symbol>` | **The reason to have this layer.** Exact on the barrel oracle (`loadEnv` → 3 files, same as `grep -rl`, barrel edge through `shared/src/index.ts` resolved). On `MOB_KINDS` it returns a correct **superset** — 6 files where grep finds 3, because `rpg-buttons.ts`, `rpg.ts` and `encounter.ts` never name the symbol but would break if it changed. 0 misses observed. **13.5× less context.** |
| `codegraph callers <symbol>`| 11/11 on `logger` — no undercount currently observable. **Not proven complete**; see below.      |
| `codegraph node <file>`     | Cheap way to get one file's source + its dependents in one shot.                                 |

Transitive reach is the thing grep cannot do: for "what breaks if I change X",
lead with `impact`.

## Do NOT use it for

- **Renames, deletions, "every usage of X".**

  **12 names are exported more than once inside `bots/discord`**, and the graph
  **unions** their callers instead of distinguishing them. `applyGuess` is defined
  in *both* `hangman/game.ts` and `wordle/game.ts`; `callers applyGuess` returns
  `commands/hangman.ts` and `commands/wordle.ts` as one list. Renaming one off
  that list would touch the other. The result looks complete and is not.

  The 12: `Cell`, `Character`, `Game`, `WORDS`, `applyGuess`, `buildEmbed`,
  `createGame`, `evaluate`, `loadGame`, `newGame`, `pickWord`, `updateGame`.
  (This was 32 when Slack was in the repo — removing it shrank the list but did
  **not** eliminate the problem: the conflation was never purely cross-workspace.)
  Regenerate after adding a feature:

  ```bash
  grep -rhoE "^export (async function|function|class|const|interface|type) [A-Za-z0-9_]+" \
    bots/discord --include=*.ts | awk '{print $NF}' | sort | uniq -d
  ```

  Use `grep -rnw <symbol>` and confirm each hit.

- **Trusting `callers` as complete.** The first benchmark caught a real miss — a
  file that imported and called `logger` with syntax identical to files the graph
  *did* find, yet was absent from `callers logger`. That file has since been
  deleted, so the miss is no longer reproducible. **The evidence disappeared; the
  resolver did not change.** `callers` is for scoping, not for completeness.

- **`codegraph explore` for orienting in a feature.** Measured **1.6×** context
  saving (15,892 B of graph output vs 25,160 B to read the whole `gambling/`
  feature dir). At that ratio just read the files — exact, and barely larger. The
  20–180× figures in the personal skill are for large monorepos; this repo is thin
  independent feature dirs with little structure to compress.

- **Anything about uncommitted edits.** The index reflects the last
  `init`/`sync`, not your working tree. Run `npm run codegraph:sync` first, and
  complete the branch delta with grep+read regardless.

## The short version

`impact` is worth it — exact, transitive, 13.5× cheaper. `callers` is for
scoping only, never for completeness. `explore` is not worth it here — read the
files. Never rename off the graph: 12 duplicate names get unioned.
