---
title: "Tic-tac-toe"
tableOfContents:
  maxHeadingLevel: 3
---

:::note[Rendered from `docs/discord/tictactoe/README.md`]
Generated on every docs build. Edit the source in `docs/`, not here.
:::
Tic-tac-toe on a 3×3 grid of buttons, against the bot or another member.

## Command surface

| Command | Effect |
| --- | --- |
| `/tictactoe` | Play the bot. |
| `/tictactoe opponent:@user` | Play another member. You can't pick yourself or a bot (leave `opponent` empty to play the bot). |

## How it works

The player who ran the command is ❌ and moves first; the opponent, or the bot, is ⭕. Each move is a button press on an empty square, and the message updates in place with whose turn it is.

- Presses from anyone other than the current player get an ephemeral "Not your turn."
- **The bot** answers in the same press as your move. It plays perfect minimax, so it never loses: the best you can do is a draw. Among equally good moves it picks at random, so its games vary.
- Three in a row wins, and the winning line is highlighted. A full board with no line is a draw.

**A game nobody finishes** has no timeout. It stays playable until it ends or the bot restarts; after a restart its buttons answer "This game has expired."

## State

In memory only, keyed by the game message. Nothing is written to disk.

## Source layout

| Concern | Location |
| --- | --- |
| Rules + bot (minimax) | [`bots/discord/src/tictactoe/game.ts`](../../../bots/discord/src/tictactoe/game.ts) |
| Slash command + button handler | [`bots/discord/src/commands/tictactoe.ts`](../../../bots/discord/src/commands/tictactoe.ts) |
| Button routing | [`bots/discord/src/index.ts`](../../../bots/discord/src/index.ts) |
