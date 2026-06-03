# Discord bot

A Discord bot with gambling games, a shared multiplayer RPG world, a DM-led
D&D campaign layer, and (experimental) music playback — plus a steady drip of
smaller features.

- [Architecture](architecture.md) — interaction routing, button prefixes,
  Discord-specific data paths.
- [Setup](setup.md) — registering slash commands, running the bot, data dirs.

## Feature index

- [Gambling](gambling/README.md) — `/coins` `/slots` `/blackjack` `/dice`
- [RPG](rpg/README.md) — `/rpg` shared multiplayer world, mobs, loot, leveling
- [D&D](dnd/README.md) — `/dnd` DM-led campaigns: narration, initiative, monsters
- [Music](music/README.md) — experimental, may break
- [Leaderboards](leaderboards/README.md) — `/top` cross-category top 10
- [Quote Book](quotes/README.md) — `/quote` save/recall memorable server messages, context-menu shortcut
- [Reminders & Birthdays](reminders/README.md) — `/remindme` one-shot pings, `/birthday` annual wishes, shared tick loop
- [Hangman](hangman/README.md) — `/hangman` cooperative thread-based guessing game
- [Trivia](trivia/README.md) — `/trivia` multiple-choice questions via OpenTDB, first correct answer wins
- [Img](img/README.md) — `/img meme` `/img card` PNG image generation (Satori + resvg)
- [Post](post/README.md) — `/post meme` `/post card` render 1080×1080, preview in Discord, approve & publish to Instagram via Graph API
- [Mafia](mafia/README.md) — `/mafia` Werewolf-style social deduction game with DM-based night actions
- [Dice Table](dicetable/README.md) — `/dicetable` voice-channel **Activity**: players ante coins, everyone rolls 2d6, biggest roll takes the pot. Replaced the former Mafia Activity.
- [Confession Box](confessions/README.md) — `/confess` anonymous per-guild confession channel with admin setup
- [Timezone Clock](clock/README.md) — `/clock` register your timezone, see everyone's local time at a glance
- [Connect Four](connect-four/README.md) — `/c4 @opponent` button-driven 7×6 two-player Connect Four
- [Ask](ask/README.md) — `/ask` Ollama Cloud–backed Q&A command
