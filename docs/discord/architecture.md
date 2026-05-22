# Discord — architecture

Discord-specific bits. The cross-bot architecture (monorepo, runtime, the
JSON-over-SQLite stance) is in [../common/architecture.md](../common/architecture.md).

## Source layout

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
`gambling/`, `rpg/`, `dnd/`, etc. Easy to unit-test the game modules without
touching Discord types.

## Interaction routing

Single `client.on(InteractionCreate)` handler in
[../../bots/discord/src/index.ts](../../bots/discord/src/index.ts). Buttons
are dispatched by `customId` prefix:

| Prefix | Handler |
| --- | --- |
| `bj:` | Blackjack (`handleBlackjackButton`) |
| `ttt:` | Tic-tac-toe (`handleTicTacToeButton`) |
| `c4:` | Connect Four |
| `rpg:` | RPG action buttons |
| _(else)_ | Command map keyed by `data.name` |

Wordle is the odd one out — it plays in a thread and listens to
`MessageCreate` for guesses rather than going through the slash-command
router.

## Data paths

| Path | What |
| --- | --- |
| `bots/discord/data/wallets.json` | Per-user gambling balances (single file, all users) |
| `bots/discord/data/rpg/<guild-id>.json` | One RPG world per Discord guild |
| `bots/discord/data/dnd/<guild-id>.json` | One D&D campaign per Discord guild |
| `bots/discord/data/<feature>.json` | Per-feature flat stores (quotes, reminders, birthdays, timezones, confessions, …) |

All stores: in-memory cache + serialized writes (per-key promise chain for
per-guild files, single chain for shared files).
