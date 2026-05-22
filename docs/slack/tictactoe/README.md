# `/ttt` — tic-tac-toe

## Surface

| Command | What it does |
| --- | --- |
| `/ttt` | Start a game versus the bot. |
| `/ttt @user` | Challenge another workspace member. |

Renders as a 3×3 grid of Block Kit buttons. The bot updates the same message
in-place via `chat.update` after each move, so the channel doesn't fill up
with intermediate boards.

## Bot opponent

The "play the bot" path uses the same minimax implementation as the Discord
bot — perfect play, ties prefer random shuffling so it doesn't always choose
the same square.

## Surface details

- Buttons that aren't currently playable (already filled, game over) get a
  throwaway `action_id` prefixed with `ttt_disabled:`. Bolt still acks them
  silently so users don't see "this didn't work" warnings.
- Match state is keyed by the message `ts`. A restart wipes active games.

## Source

| What | Where |
| --- | --- |
| Game logic + minimax (pure) | [`bots/slack/src/tictactoe/game.ts`](../../../bots/slack/src/tictactoe/game.ts) |
| Block Kit rendering + registry | [`bots/slack/src/tictactoe/slack.ts`](../../../bots/slack/src/tictactoe/slack.ts) |
| Slash + button-action wiring | [`bots/slack/src/index.ts`](../../../bots/slack/src/index.ts) |
