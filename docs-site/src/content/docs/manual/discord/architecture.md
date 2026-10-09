---
title: "Discord — architecture"
tableOfContents:
  maxHeadingLevel: 3
---

:::note[Rendered from `docs/discord/architecture.md`]
Generated on every docs build. Edit the source in `docs/`, not here.
:::
Discord-specific bits. The repo-wide architecture (workspaces, runtime, the
JSON-over-SQLite stance) is in [../common/architecture.md](../common/architecture.md).

## Source layout

```
bots/discord/src/
├── index.ts            client bootstrap, interaction router
├── env.ts              zod-validated env
├── register.ts         registers slash commands per guild
├── commands/           thin slash-command handlers
│   ├── *.ts            one file per command (or close family)
│   └── index.ts        exports the Command[] used by index.ts + register.ts
├── gambling/           wallet + slot/blackjack/dice game logic
└── rpg/                world model, combat, mob spawn/tick, map renderer
```

**Convention:** `commands/*.ts` is the Discord-facing surface (slash defs,
interaction parsing, embed rendering). Real logic lives next to it in
`gambling/`, `rpg/`, etc. Easy to unit-test the game modules without
touching Discord types.

## Interaction routing

Single `client.on(InteractionCreate)` handler in
[../../bots/discord/src/index.ts](../../bots/discord/src/index.ts). Buttons
are dispatched by `customId` prefix:

| Prefix | Handler |
| --- | --- |
| `rpg:` | RPG buttons, select menus and modals (checked first) |
| `bj2:` | Two-player Blackjack (`handleBlackjack2Button`) |
| `bj:` | Blackjack (`handleBlackjackButton`) |
| `dice2:` | Two-player dice (`handleDice2Button`) |
| `slots:` | Slots (`handleSlotsButton`) |
| `ttt:` | Tic-tac-toe (`handleTicTacToeButton`) |
| `quote:list:` | Quote list paging (`handleQuoteListButton`) |
| `trv:` | Trivia (`handleTriviaButton`) |
| `maf:` | Mafia (`handleMafiaButton`) |
| `c4:` | Connect Four (`handleConnectFourButton`) |
| _(else)_ | Command map keyed by `data.name` |

Wordle and Hangman are the exceptions: each plays in a thread, and the
`MessageCreate` handler routes guesses to whichever game owns that thread
(`hasWordleGame`, `hasHangmanGame`) rather than going through the button router.

## Data paths

| Path | What |
| --- | --- |
| `bots/discord/data/wallets.json` | Per-user gambling balances (single file, all users) |
| `bots/discord/data/rpg/<guild-id>.json` | One RPG world per Discord guild |
| `bots/discord/data/<feature>.json` | Per-feature flat stores (quotes, reminders, birthdays, timezones, confessions, …) |

All stores: in-memory cache + serialized writes (per-key promise chain for
per-guild files, single chain for shared files).
