# Discord — architecture

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
├── drain.ts            the shutdown flush of every store
├── gambling/           wallet + slot/blackjack/dice game logic
├── rpg/                world model and places, controller screens, combat,
│                       duels, trades, shop, bounties, town crier
├── jukebox/            the atrium link, the per-guild player, the disk buffer
├── wicket/             the client for Wicket, the queue `/ask` goes through
└── <feature>/          one folder for each other feature: ask, clock,
                        confessions, connect-four, hangman, img, leaderboard,
                        mafia, quotes, reminders, tictactoe, trivia, wordle
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
| `bots/discord/data/timezones.json` | Each member's `/clock` time zone (single file) |
| `bots/discord/data/rpg/<guild-id>.json` | One RPG world per Discord guild |
| `bots/discord/data/quotes/<guild-id>.json` | The guild's quote book |
| `bots/discord/data/confessions/<guild-id>.json` | The guild's confession channel, its next number and the confessions posted |
| `bots/discord/data/mafia/<guild-id>.json` | The guild's Mafia game, deadlines included, so timers re-arm after a restart |
| `bots/data/reminders.json` | Every pending `/remindme` reminder |
| `bots/data/birthdays.json` | Every guild's birthdays |

All stores: in-memory cache + serialized writes (per-key promise chain for
per-guild files, single chain for shared files), each written to a temp file
and renamed into place. Games without a file (Wordle, Hangman, trivia,
tic-tac-toe, Connect Four, blackjack, dice duels) live in memory and end on a
restart. The Jukebox keeps its session in memory and buffers songs under
`$TMPDIR/jukebox/<guild-id>/`.
