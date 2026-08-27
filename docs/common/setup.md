# Setup

Install and typecheck. Discord-specific setup — token wiring, registering slash
commands, required intents — is in [../discord/setup.md](../discord/setup.md).

## Requirements

- **Node ≥ 22.12** (`engines` in the root `package.json`).
- npm (the repo uses npm workspaces: `shared`, `bots/discord`).

## Install

```bash
npm install
```

One install at the repo root covers both workspaces. There is **no build step** —
`tsx` runs the TypeScript directly.

## Verify

```bash
npm run typecheck     # tsc --noEmit across the workspaces
npm run corpus:lint   # corpus/ health check (frontmatter, links, page size)
```

There is no test suite; `typecheck` plus running the bot is the verification
path.

## Layout

| Path                   | What                                                          |
| ---------------------- | ------------------------------------------------------------- |
| `bots/discord/`        | the bot (`@bots/discord`) — one directory per feature          |
| `shared/src/`          | `@bots/shared` — `logger`, `loadEnv`, reminder parse/store, the dice-table wire protocol |
| `bots/data/`           | persisted JSON state, gitignored                               |
| `corpus/`              | project knowledge: decisions, status, work lifecycle           |
| `docs/`                | these docs — per-feature operating manuals                     |

## Environment

Env is validated with Zod at startup via `@bots/shared`'s `loadEnv`. Required
config fails fast at boot; optional integrations report "not configured" instead
of crashing the bot. Put values in `bots/discord/.env` — see
[../discord/setup.md](../discord/setup.md) for the variable list.

**One running instance per bot token.** Discord delivers every interaction to
every live gateway session, so running `discord:dev` locally while the VPS is up
makes both instances answer and the loser throws `DiscordAPIError 40060`. Use a
separate Discord application + token for local development.
