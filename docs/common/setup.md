# Setup

Install, check and test. Discord-specific setup (the token and the other env
vars, the gateway intents, registering slash commands, running the bot) is in
[../discord/setup.md](../discord/setup.md).

## Requirements

- **Node ≥ 22.12** (`engines` in the root `package.json`).
- npm (the repo uses npm workspaces: `shared`, `bots/discord`, `docs-site`).

## Install

```bash
npm ci
```

One install at the repo root covers all three workspaces, including the Docusaurus
toolchain the documentation site builds with. `npm ci` installs exactly what
`package-lock.json` pins and leaves it alone; `npm install` works too, but an npm
older than the one that wrote the lockfile rewrites it. The bot has **no build
step**: `tsx` runs the TypeScript directly. Only the docs site builds:

```bash
npm run docs -w @bots/docs-site   # → docs-site/dist, for /just-a-bot/docs (not deployed yet)
```

## Verify

```bash
npm run check         # the gate: typecheck, lint, format:check, check:conventions, then test:clean
npm run check:fast    # typecheck, then ESLint on the files changed against HEAD; never the tests
npm run typecheck     # tsc --noEmit across the workspaces
npm run test:clean    # the node:test suites (*.test.ts), in a copy without .env
npm run format        # Prettier writes every file it covers; Markdown stays out
npm run corpus:lint   # corpus/ health check (frontmatter, links, page size)
```

`npm run check` is the bar before a change is handed back. `check:conventions`
runs knip, dependency-cruiser and the house-style checkers, configured from
`vendor/house-style/` and [`scripts/conventions.json`](../../scripts/conventions.json).

**Never run `npm test` in the checkout.** Two tests import
`bots/discord/src/env.ts`, which loads `bots/discord/.env`, and on a machine
that deploys that file holds production's token. `test:clean` copies the repo
into a temporary folder without any `.env*` file, `docs-site/` or git-ignored
state, links the checkout's `node_modules` into it and runs `npm test` there. It
refuses to run if a `.env*` file reached the copy anyway.

On 2026-11-16 the suites held 119 tests: the game logic (blackjack, Wordle,
Connect Four, the hangman word list, RPG trades, the shop, proposals and
names), reminder parsing and delivery, the shutdown drain, `/ask`'s limits,
replies and Wicket client, the Jukebox's player, buffer, speaker, formatting
and atrium session, and the `/confess`, `/help`, `/jukebox` and `/quote` handlers against
stub interactions. None of them connects to Discord; what needs a live gateway
is still checked by running the bot.

## Layout

| Path                   | What                                                          |
| ---------------------- | ------------------------------------------------------------- |
| `bots/discord/`        | the bot (`@bots/discord`) — one directory per feature          |
| `shared/src/`          | `@bots/shared` — `logger`, `loadEnv`, reminder parse/store |
| `bots/data/`           | reminders and birthdays, as JSON; gitignored                   |
| `bots/discord/data/`   | every other feature's JSON state; gitignored                   |
| `corpus/`              | project knowledge: decisions, status, work lifecycle           |
| `docs/`                | these docs — per-feature operating manuals                     |
| `docs-site/`           | the Docusaurus site that renders `docs/` and `corpus/`         |
| `infrastructure/`      | the production container's Dockerfile and compose file         |
| `scripts/`             | `test-clean.mjs`, `check-fast.mjs` and the conventions config   |
| `vendor/house-style/`  | the shared lint, format and TypeScript config; generated, never edited |

## Environment

Env is validated with Zod at startup via `@bots/shared`'s `loadEnv`. Required
config fails fast at boot; optional integrations report "not configured" instead
of crashing the bot. Put values in `bots/discord/.env` — see
[../discord/setup.md](../discord/setup.md) for the variable list.

**One running instance per bot token.** Discord delivers every interaction to
every live gateway session, so running `discord:dev` locally while the VPS is up
makes both instances answer and the loser throws `DiscordAPIError 40060`. Use a
separate Discord application + token for local development.
