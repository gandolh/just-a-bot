# Architecture

Repo-wide patterns and conventions. Discord-specific implementation notes live in
[../discord/architecture.md](../discord/architecture.md), and each feature has
its own page under [../discord/](../discord/README.md).

> This page describes **how the repo is laid out and why those patterns exist**.
> For the *current* structural map and the locked decisions behind it, see
> [corpus/wiki/architecture.md](../../corpus/wiki/architecture.md) and
> [corpus/wiki/decisions.md](../../corpus/wiki/decisions.md) — the corpus is
> kept current as work lands; this page is revisited only when a pattern
> changes.

## Monorepo

npm workspaces:

- [`shared/`](../../shared) — `@bots/shared`: logger, env loader, reminder
  parse/store. Deliberately runtime-agnostic — no `discord.js` imports.
- [`bots/discord/`](../../bots/discord) — the bot (discord.js v14).

This was a multi-bot monorepo until 2026-08-27, when the Slack, WhatsApp and
dice-activity workspaces were removed, followed by the `/dicetable` feature and
the music subsystem — see
[corpus/wiki/decisions.md](../../corpus/wiki/decisions.md). The two-workspace
split is kept because `shared/` still holds code with no Discord dependency at
all, which the package boundary enforces mechanically.

## Runtime

TypeScript runs **directly** via [tsx](https://github.com/privatenumber/tsx) — no
build step in the run path. `npm run <bot>:start` → `tsx src/index.ts`.
`npm run typecheck` runs `tsc --noEmit` for validation across every workspace.

Relative imports use `.ts` extensions because `tsconfig.base.json` sets
`allowImportingTsExtensions: true` + `noEmit: true`. `@bots/shared` resolves
to `shared/src/index.ts` directly — no `dist/`.

## Source layout convention

The bot follows a consistent split:

```
bots/discord/src/
├── index.ts        bot bootstrap + interaction/event wiring
├── env.ts          zod-validated env
├── commands/       one thin slash-command handler per feature
├── <feature>/
│   ├── game.ts     pure logic (no platform imports)
│   └── discord.ts  platform-specific glue (embeds, state registry)
```

Pure feature logic stays free of `discord.js` imports where it is cheap to do so:
it keeps the data model testable and readable on its own. The original reason —
porting a feature to another bot — no longer applies now that Discord is the only
target, so this is a readability convention rather than a hard rule. See the
revisit note in [corpus/wiki/decisions.md](../../corpus/wiki/decisions.md).

## Persistence

All persisted state is JSON on local disk, gitignored: `bots/data/` for shared
files (birthdays, reminders, timezones, wallets, RPG worlds) and
`bots/discord/data/` for bot-local files.
In-memory cache plus a serialized write chain (per-key for per-guild/team
files, single chain for shared files like wallets). No SQLite — files have to
be human- and LLM-readable.

Scoping is per `guild_id`. Per-feature docs spell out which file layout each
feature uses.

## Design notes

- **No SQLite, even though it would fit.** JSON wins because the RPG world
  needs to be ingestible by an LLM in one read, and most volumes are trivial.
- **No build step.** Direct-tsx in production trades a few seconds of startup
  for one less moving part. `tsx` lives in devDependencies; `npm install
  --production` will break the run script — move `tsx` to a real dep if that
  scenario actually shows up. (Nothing in the repo builds any more: the one
  workspace that did was removed on 2026-08-27.)
- **Commands vs game logic split.** Keeps platform-specific code (embeds,
  blocks, options, replies) from bleeding into the data model.
