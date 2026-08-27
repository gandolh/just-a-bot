---
summary: How the repo and the Discord bot are put together: the two workspaces, the no-build tsx runtime, one-feature-dir-per-capability layout, and the commands→features→shared dependency direction.
updated: 2026-08-27
---

# Architecture

## Workspaces (npm)

Defined in the root [package.json](../../package.json): `shared` and
`bots/discord`. Two workspaces rather than one because `shared/` deliberately
holds code with no `discord.js` dependency — including the dice-table wire
protocol, which must stay shareable with the Activity app now that it lives
outside this repo.

```
just-a-bot/
  shared/                @bots/shared — logger, loadEnv, reminder parse/store,
                         dice-table wire protocol
  bots/
    discord/             @bots/discord — the bot (see below)
      data/              bot-local JSON state (gitignored)
    data/                shared JSON state, gitignored — birthdays, reminders,
                         timezones, wallets, quotes, confessions, rpg/, worlds/
  ecosystem.config.cjs   pm2 process definitions
  tsconfig.base.json     shared TS config
```

- **Nothing builds** — `tsx src/index.ts` runs TypeScript directly. (The one
  workspace that did build, `dice-activity`, was removed 2026-08-27.)
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

- **`index.ts`** — client bootstrap, wires up commands and the player.
- **`register.ts`** — registers slash commands with Discord.
- **`env.ts`** — Zod-validated env loading via `@bots/shared`'s `loadEnv`.
- **`commands/`** — one thin slash-command handler per feature
  (`commands/index.ts` aggregates them; `types.ts` defines the `Command` shape).
- **One directory per feature** under `src/` — `rpg/`, `mafia/`, `trivia/`,
  `hangman/`, `wordle/`, `connect-four/`, `tictactoe/`, `gambling/`, `ollama/`
  (AI chat), `img/`, `dnd/`, `confessions/`, `quotes/`, `leaderboard/`,
  `reminders/`, `clock/`, `dicetable/`, `instagram/`.
- There is **no audio stack**. The music subsystem and all eight of its
  dependencies were removed 2026-08-27 — see [music.md](music.md) for the
  post-mortem and [decisions.md](decisions.md) for why.

### Dependency direction

`commands/*` → feature modules + `player.ts` → `@bots/shared`. Commands are thin;
logic lives in feature dirs. The player is a module-level singleton initialized
once at startup (`initPlayer`) and fetched via `getPlayer()`.
