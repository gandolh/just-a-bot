# Setup & ops

## Install

```
npm install
```

Single root install covers all workspaces (`shared`, `bots/discord`).

## Register slash commands

Slash commands are registered **per guild** for fast propagation during
development. Re-run whenever command shapes change (new command, new
option, renamed choice, etc.).

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

## Typecheck

```
npm run typecheck
```

Runs `tsc --noEmit` across all workspaces.

## Data directories

Runtime state lives under `bots/discord/data/` and is gitignored.

| Path                                          | What                                                |
| --------------------------------------------- | --------------------------------------------------- |
| `bots/discord/data/wallets.json`              | Per-user gambling balances                          |
| `bots/discord/data/rpg/<guild-id>.json`       | One RPG world per Discord guild                     |
| `bots/discord/data/dnd/<guild-id>.json`       | One D&D campaign per Discord guild (DM, party, …)   |

Wiping a file resets that feature's state. RPG worlds and D&D campaigns
can be hand-edited or piped to an LLM directly; their data models are
described in [../rpg/README.md](../rpg/README.md) and
[../dnd/README.md](../dnd/README.md).
