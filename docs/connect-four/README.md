# Connect Four

A two-player, button-driven Connect Four game. One player challenges another with `/c4 @opponent`; they take turns dropping discs into a 7-wide × 6-tall grid until someone connects four or the board fills.

## Command surface

| Command          | Effect                                                        |
| ---------------- | ------------------------------------------------------------- |
| `/c4 @opponent`  | Start a new game against the mentioned user. Red goes first.  |

## How it works

The challenger always plays Red (🔴); the mentioned opponent plays Yellow (🟡). Empty cells render as ⚫.

After each turn the board is re-drawn as an embed description, with seven column-buttons (labelled 1–7) beneath it. Players click a button to drop their disc into that column. The disc falls to the lowest unfilled row.

**Win condition:** first to place four discs in a straight line — horizontal, vertical, or either diagonal — wins. Draw if the board fills with no winner.

**Turn enforcement:** button presses from anyone other than the current player are rejected with an ephemeral reply.

**Timeout:** if the current player does not move within 90 seconds, their opponent wins by forfeit. The embed is updated to reflect the result and all buttons are removed.

**State:** entirely in-memory. One game per message ID. No persistence across bot restarts.

## Source layout

| Concern          | Location                                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------- |
| Game logic       | [`bots/discord/src/connect-four/game.ts`](../../bots/discord/src/connect-four/game.ts)           |
| Slash command + button handler | [`bots/discord/src/commands/connect-four.ts`](../../bots/discord/src/commands/connect-four.ts) |
| Command registry | [`bots/discord/src/commands/index.ts`](../../bots/discord/src/commands/index.ts)                 |
| Button router    | [`bots/discord/src/index.ts`](../../bots/discord/src/index.ts) (`c4:` prefix)                   |

## Design notes

- **Winning cells highlighted.** When the game ends, the four winning discs render as 🟥 / 🟨 so the line is immediately visible.
- **Column disabled when full.** Columns with no empty rows have their button disabled so players cannot attempt invalid moves.
- **90-second forfeit, not draw.** Inactivity is attributed as a loss rather than a draw, giving the active player a win they earned by showing up.
- **No persistence.** Games are purely in-memory and disappear on bot restart. This matches the spec and keeps the implementation simple; no per-guild JSON file is needed.
- **One active game per message.** The match map is keyed by the reply message ID, so multiple simultaneous games in the same or different channels work without collision.
