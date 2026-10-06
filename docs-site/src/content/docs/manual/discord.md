---
title: "Discord bot"
tableOfContents:
  maxHeadingLevel: 3
---

:::note[Rendered from `docs/discord/README.md`]
Generated on every docs build. Edit the source in `docs/`, not here.
:::
A Discord bot with gambling games, a shared multiplayer RPG world, and a
steady drip of smaller features.

- [Architecture](architecture.md) — interaction routing, button prefixes,
  Discord-specific data paths.
- [Setup](setup.md) — registering slash commands, running the bot, data dirs.

## Feature index

- [Gambling](gambling/README.md) — `/coins` `/give` `/slots` `/blackjack` `/blackjack2` `/dice` `/dice2`
- [RPG](rpg/README.md) — `/rpg` shared multiplayer world, mobs, loot, leveling
- [Leaderboards](leaderboards/README.md) — `/top` cross-category top 10
- [Quote Book](quotes/README.md) — `/quote` save/recall memorable server messages, context-menu shortcut
- [Reminders & Birthdays](reminders/README.md) — `/remindme` one-shot pings, `/birthday` annual wishes, shared tick loop
- [Hangman](hangman/README.md) — `/hangman` cooperative thread-based guessing game
- [Trivia](trivia/README.md) — `/trivia` multiple-choice questions via OpenTDB, first correct answer wins
- [Img](img/README.md) — `/img meme` `/img card` PNG image generation (Satori + resvg)
- [Mafia](mafia/README.md) — `/mafia` Werewolf-style social deduction game with DM-based night actions
- [Confession Box](confessions/README.md) — `/confess` anonymous per-guild confession channel with admin setup
- [Timezone Clock](clock/README.md) — `/clock` register your timezone, see everyone's local time at a glance
- [Connect Four](connect-four/README.md) — `/c4` against the bot, `/c42 opponent` against another member; button-driven 7×6 Connect Four
- [Wordle](wordle/README.md) — `/wordle` guess a five-letter word in six tries, in a thread
- [Tic-tac-toe](tictactoe/README.md) — `/tictactoe [opponent]` against the bot or another member, with buttons
- [Ask](ask/README.md) — `/ask` Ollama Cloud–backed Q&A command
