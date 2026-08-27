# just-a-bot

Hobby **Discord bot** — two npm workspaces (`shared`, `bots/discord`),
TypeScript run directly via `tsx`, pm2 on a small shared VPS.

## Read this first

**Start at [corpus/index.md](corpus/index.md).** It is the content catalog for
`corpus/`, this project's LLM-maintained wiki — decisions, current status, and
subsystem synthesis. Triage on the `summary:` lines there, then read **at most
2–3 wiki pages**. Needing more is a signal that a page must split, not a licence
to read on. Conventions: [corpus/CLAUDE.md](corpus/CLAUDE.md).

Before proposing a tech change, check [corpus/wiki/decisions.md](corpus/wiki/decisions.md) —
locked calls with their reasons. Before using a project term (*provider*,
*extractor*, *feature dir*, *shelved*), check
[corpus/wiki/glossary.md](corpus/wiki/glossary.md).

## Two documentation layers — don't confuse them

| Layer     | Owns                                                              | Audience |
| --------- | ----------------------------------------------------------------- | -------- |
| `corpus/` | **why** — decisions + reasons, dated status, open questions, work lifecycle (todos → briefs → done + log), subsystem synthesis | agents, and me when planning |
| `docs/`   | **how to use and set up** — per-feature reference, env vars, triage runbooks, install steps | me, later, when operating a feature |

Neither is the code. When they disagree, the order is: **actual code** → a brief
in `corpus/briefs/done/` → `corpus/wiki/decisions.md` → `corpus/wiki/status.md` →
`docs/`. `docs/` ranks last because it is written once per feature and rarely
revisited — treat a `docs/` claim about current behavior as a lead, not a fact.

When a change lands: record the *why* in `corpus/`, update the *how* in `docs/`
if the feature's usage or setup changed. A decision only in `docs/` is a decision
that will be relitigated.

## Working in this repo

- **No build step, anywhere.** `tsx src/index.ts` runs TypeScript directly in dev
  *and* in production under pm2. Relative imports carry explicit `.ts` suffixes
  (`from './play.ts'`) — `tsconfig.base.json` sets `allowImportingTsExtensions`
  + `noEmit`.
- **Verify with `npm run typecheck`** (`tsc --noEmit` across every workspace).
  There is no test suite.
- **Run a bot:** `npm run discord:dev` (tsx watch) / `discord:start` (pm2 path).
  `npm run discord:register` pushes slash-command definitions to Discord.
- **One running instance per bot token.** Discord delivers every interaction to
  every live gateway session, so a local `discord:dev` while the VPS is up makes
  both instances answer and the loser throws `DiscordAPIError 40060`. Use a
  separate dev application + token locally.
- **State is gitignored JSON** under `bots/data/` (shared) and
  `bots/discord/data/` (bot-local). No database, deliberately — see
  `decisions.md`.
- **`npm run corpus:lint`** before committing corpus changes.
- **Commit only when asked**, and never to `main` without branching first.
