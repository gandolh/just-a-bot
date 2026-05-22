# Setup (cross-bot)

The bits that apply to every bot. Per-bot setup (token wiring, registering
commands, running specific bots) lives in [../discord/setup.md](../discord/setup.md)
and [../slack/README.md](../slack/README.md).

## Install

```
npm install
```

Single root install covers every workspace (`shared`, `bots/discord`,
`bots/slack`, `bots/whatsapp`).

Requires Node ≥ 22.12 (see [`package.json`](../../package.json#L4-L6)
`engines`).

## Typecheck

```
npm run typecheck
```

Runs `tsc --noEmit` across every workspace via `npm run typecheck
--workspaces --if-present`. No bot is built — typecheck is the only static
validation.

## Where things live

| Path | What |
| --- | --- |
| `shared/src/` | Cross-bot helpers (`logger`, `loadEnv`, adapter types) |
| `bots/<bot>/src/` | A bot's source tree |
| `bots/<bot>/data/` | A bot's runtime JSON state — gitignored |
| `bots/<bot>/.env` | A bot's tokens — gitignored |

## Conventions

- Each bot ships its own `package.json` with its own `dev` / `start` scripts.
  Root-level `npm run <bot>:dev` proxies into the workspace.
- `.env` files live next to the bot they configure (`bots/discord/.env`,
  `bots/slack/.env`).
- Adding a new bot: create `bots/<name>/`, add it to `workspaces` in the root
  `package.json`, mirror the `src/index.ts` + `src/env.ts` shape from an
  existing bot, and depend on `@bots/shared`.
