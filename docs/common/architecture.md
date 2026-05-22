# Architecture (cross-bot)

Patterns and conventions shared by every bot in the monorepo. Bot-specific
implementation notes live in [../discord/architecture.md](../discord/architecture.md)
and the per-feature docs under [../slack/](../slack/).

## Monorepo

npm workspaces:

- [`shared/`](../../shared) — cross-bot helpers: logger, env loader, bot-adapter
  types. Deliberately runtime-agnostic (no Discord or Slack types).
- [`bots/discord/`](../../bots/discord) — Discord bot (discord.js v14).
- [`bots/slack/`](../../bots/slack) — Slack bot (@slack/bolt, Socket Mode).
- [`bots/whatsapp/`](../../bots/whatsapp) — WhatsApp bootstrap.

New bots go under `bots/<name>/` and add their own workspace entry. They
should depend on `@bots/shared` and keep platform-specific code out of any
files imported by another workspace.

## Runtime

TypeScript runs **directly** via [tsx](https://github.com/privatenumber/tsx) — no
build step in the run path. `npm run <bot>:start` → `tsx src/index.ts`.
`npm run typecheck` runs `tsc --noEmit` for validation across every workspace.

Relative imports use `.ts` extensions because `tsconfig.base.json` sets
`allowImportingTsExtensions: true` + `noEmit: true`. `@bots/shared` resolves
to `shared/src/index.ts` directly — no `dist/`.

## Source layout convention

Each bot follows the same split:

```
bots/<bot>/src/
├── index.ts        bot bootstrap + interaction/event wiring
├── env.ts          zod-validated env
├── <feature>/
│   ├── game.ts     pure logic (no platform imports)
│   └── <bot>.ts    platform-specific glue (rendering, state registry)
```

Pure feature logic stays free of `discord.js` / `@slack/bolt` imports so the
same module can be ported to another bot — the Wordle and Tic-Tac-Toe game
modules are duplicated between Discord and Slack today only because their
word lists / minimax are tiny and copying is cheaper than abstracting.

## Persistence

All persisted state is JSON on local disk under `bots/<bot>/data/`. Gitignored.
In-memory cache plus a serialized write chain (per-key for per-guild/team
files, single chain for shared files like wallets). No SQLite — files have to
be human- and LLM-readable.

Scoping: Discord uses `guild_id`, Slack uses `team_id`. Per-feature docs spell
out which file layout each feature uses.

## Design notes

- **No SQLite, even though it would fit.** JSON wins because the RPG world
  needs to be ingestible by an LLM in one read, and most volumes are trivial.
- **No build step.** Direct-tsx in production trades a few seconds of startup
  for one less moving part. `tsx` lives in devDependencies; `npm install
  --production` will break the run script — move `tsx` to a real dep if that
  scenario actually shows up.
- **Commands vs game logic split.** Keeps platform-specific code (embeds,
  blocks, options, replies) from bleeding into the data model.
