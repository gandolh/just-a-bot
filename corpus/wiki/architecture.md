# Architecture

## Monorepo (npm workspaces)

Defined in the root [package.json](../../package.json): workspaces are `shared`
and `bots/*`.

```
just-a-bot/
  shared/                @bots/shared — shared utils (logger, loadEnv, …)
  bots/
    discord/             @bots/discord — the flagship bot (see below)
    slack/               @bots/slack
    whatsapp/            @bots/whatsapp
    dice-activity/       @bots/dice-activity — Discord voice Activity (web app, has a build)
    data/                JSON state (birthdays.json, reminders.json)
  ecosystem.config.cjs   pm2 process definitions
  tsconfig.base.json     shared TS config
```

- **No build for the bots** — `tsx src/index.ts` runs TypeScript directly.
  `dice-activity` is the exception (it's a web app with `dist/`).
- Run scripts live in the root package.json (`discord:dev`, `discord:start`,
  `discord:register`, etc.).

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
- **`player.ts`** — the music player singleton (discord-player). See
  [music.md](music.md).

### Dependency direction

`commands/*` → feature modules + `player.ts` → `@bots/shared`. Commands are thin;
logic lives in feature dirs. The player is a module-level singleton initialized
once at startup (`initPlayer`) and fetched via `getPlayer()`.
