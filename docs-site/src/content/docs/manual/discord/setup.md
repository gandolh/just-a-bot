---
title: "Discord — setup & ops"
tableOfContents:
  maxHeadingLevel: 3
---

:::note[Rendered from `docs/discord/setup.md`]
Generated on every docs build. Edit the source in `docs/`, not here.
:::
Install / typecheck steps are in [../common/setup.md](../common/setup.md); this
page covers the bot's own configuration.

## Token

Copy `bots/discord/.env.example` to `bots/discord/.env` and fill in the three
required values:

```
DISCORD_TOKEN=...   # the bot token
CLIENT_ID=...       # the application id (a numeric snowflake)
GUILD_ID=...        # the guild slash commands are registered to
```

`env.ts` validates with zod and fails fast on boot if any of them is missing or
not numeric where it should be. `OLLAMA_API_KEY` (for `/ask`) is optional.

## Register slash commands

Slash commands are registered **per guild** for fast propagation during
development. Re-run whenever command shapes change (new command, new option,
renamed choice, etc.).

```
npm run discord:register
```

Editing a command body without changing its slash definition does **not**
require re-registering.

## Run

Dev (auto-reload via tsx watch):

```
npm run discord:dev
```

Production (no watcher):

```
npm run discord:start
```

Both run TypeScript directly through tsx — no build step.

## Data directories

Runtime state lives under `bots/discord/data/` and is gitignored.

| Path | What |
| --- | --- |
| `bots/discord/data/wallets.json` | Per-user gambling balances |
| `bots/discord/data/rpg/<guild-id>.json` | One RPG world per Discord guild |

Wiping a file resets that feature's state. RPG worlds can be hand-edited or
piped to an LLM directly; the data model is described in
[rpg/README.md](rpg/README.md).
