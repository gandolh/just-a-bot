# Architecture

## Monorepo

npm workspaces. Two:

- [`shared/`](../shared) — cross-bot helpers (logger, env loader, bot adapter types).
- [`bots/discord/`](../bots/discord) — the only bot today. Discord.js v14.

Room for `bots/<other>/` later (Slack, web, etc.); the shared package is
deliberately runtime-agnostic.

## Runtime

TypeScript run **directly** via [tsx](https://github.com/privatenumber/tsx).
No build step in the run path. `npm run discord:start` →
`tsx src/index.ts`. `npm run typecheck` runs `tsc --noEmit` for validation.

Relative imports use `.ts` extensions because `tsconfig.base.json` sets
`allowImportingTsExtensions: true` + `noEmit: true`. `@bots/shared` resolves
to `shared/src/index.ts` directly (no `dist/`).

## Bot source layout

```
bots/discord/src/
├── index.ts            client bootstrap, interaction router
├── player.ts           discord-player init (music)
├── env.ts              zod-validated env
├── register.ts         registers slash commands per guild
├── commands/           thin slash-command handlers
│   ├── *.ts            one file per command (or close family)
│   └── index.ts        exports the Command[] used by index.ts + register.ts
├── gambling/           wallet + slot/blackjack/dice game logic
├── rpg/                world model, combat, mob spawn/tick, map renderer
└── dnd/                campaign state + dice parser for the DM-led layer
```

**Convention:** `commands/*.ts` is the Discord-facing surface (slash defs,
interaction parsing, embed rendering). Real logic lives next to it in
`gambling/`, `rpg/`, or `dnd/`. Easy to write unit tests against the game
modules without touching Discord types.

## Data flow

- All persisted state is JSON on local disk, under
  `bots/discord/data/`. Gitignored.
- Gambling: `data/wallets.json` — single file, all users.
- RPG: `data/rpg/<guild-id>.json` — one file per guild.
- D&D: `data/dnd/<guild-id>.json` — one campaign per guild (DM, party,
  monsters, scene, initiative).
- All stores: in-memory cache + serialized writes (per-key promise chain
  for per-guild files, single chain for the wallet). No SQLite; everything
  LLM- and human-readable.

## Interaction routing

Single `client.on(InteractionCreate)` handler in [index.ts](../bots/discord/src/index.ts).
Buttons whose `customId` starts with `bj:` route to
`handleBlackjackButton`; `ttt:` to `handleTicTacToeButton`. Everything else
goes through the command map keyed by `data.name`. Wordle plays in a
thread and listens to `MessageCreate` for guesses.

## Design notes

- **No SQLite, even though it would fit.** JSON wins because the RPG world
  needs to be ingestible by an LLM in one read, and the wallet's volume is
  trivial. SQLite was the engineering answer; JSON is the product answer.
- **No build step.** Direct-tsx in production trades a few seconds of
  startup for one less moving part. `tsx` lives in devDependencies; if you
  ever `npm install --production`, music starts but the bot fails to boot.
  Move `tsx` to a real dep if that situation appears.
- **Commands vs game logic split.** Keeps Discord-specific code (embeds,
  options, replies) from bleeding into the data model. Useful when the same
  game logic eventually runs in a non-Discord context (web UI, tests).
