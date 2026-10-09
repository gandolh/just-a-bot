---
summary: How the repo and the Discord bot are put together: the three workspaces (two runtime, one docs build), the no-build tsx runtime, one-feature-dir-per-capability layout, and the commands→features→shared dependency direction.
updated: 2026-10-09
---

# Architecture

## Workspaces (npm)

Defined in the root [package.json](../../package.json): `shared`,
`bots/discord` and `docs-site`. The bot is the first two. `shared/` holds the
logger, `loadEnv` and the reminder parse/store, and stays its own workspace so
the "no `discord.js` here" rule is enforced by the package boundary rather than
by review. `docs-site/` is a build-time Astro/Starlight site that renders
`docs/` and `corpus/` at `/just-a-bot/docs`. It is not part of the runtime.

```
just-a-bot/
  shared/                @bots/shared — logger, loadEnv, reminder parse/store
  bots/
    discord/             @bots/discord — the bot (see below)
      data/              bot-local JSON state (gitignored)
    data/                shared JSON state, gitignored — birthdays, reminders,
                         timezones, wallets, quotes, confessions, rpg/, worlds/
  docs-site/             @bots/docs-site — the docs site (astro build), not runtime
  infrastructure/        Dockerfile + compose for the estate's container deploy
  ecosystem.config.cjs   pm2 process definitions
  tsconfig.base.json     shared TS config
```

- **The bot never builds** — `tsx src/index.ts` runs TypeScript directly, in dev
  and in production. The one build in the repo is `docs-site`'s `astro build`,
  a static site with no bearing on the bot. (`dice-activity`, which also built,
  was removed 2026-08-27.)
- Run scripts live in the root package.json (`discord:dev`, `discord:start`,
  `discord:register`, etc.), plus `typecheck` and `corpus:lint`.
- **Persistence is gitignored JSON**, never a database — see
  [decisions.md](decisions.md). In-memory cache + a serialized write chain
  (per-key for per-guild files, one chain for shared files like wallets).
- **Feature logic avoids `discord.js` imports** where cheap — now a readability
  convention rather than a portability requirement, since Discord is the only
  target. See the revisit note in [decisions.md](decisions.md).

For the per-feature operating manuals — setup, env vars, triage — see
[`docs/`](../../docs/README.md), including
[docs/common/architecture.md](../../docs/common/architecture.md), which covers
the same layout from the "how do I work in it" angle. This page is the current
map; that one is revisited only when a pattern changes.

## The Discord bot (`bots/discord/src/`)

- **`index.ts`** — client bootstrap: routes interactions and thread messages to the features, runs the reminder and town-crier ticks, and shuts the gateway down cleanly.
- **`register.ts`** — registers slash commands with Discord.
- **`env.ts`** — Zod-validated env loading via `@bots/shared`'s `loadEnv`.
- **`commands/`** — one thin slash-command handler per feature
  (`commands/index.ts` aggregates them; `types.ts` defines the `Command` shape).
- **One directory per feature** under `src/` — `rpg/`, `mafia/`, `trivia/`,
  `hangman/`, `wordle/`, `connect-four/`, `tictactoe/`, `gambling/`, `ollama/`
  (AI chat), `img/`, `confessions/`, `quotes/`, `leaderboard/`, `reminders/`,
  `clock/`, `jukebox/`. Every directory backs a registered command.
- **Music is the Jukebox** (`jukebox/`, `/jukebox`): the bot plays atrium's
  music library in voice, signed in as its own Ward account, and atrium owns
  every Player. It is the only part of the bot that talks to another of the
  owner's apps. See [jukebox.md](jukebox.md) and [decisions.md](decisions.md).

### Dependency direction

`commands/*` → feature modules → `@bots/shared`. Commands are thin; logic lives
in feature dirs, and `@bots/shared` never imports `discord.js`.
