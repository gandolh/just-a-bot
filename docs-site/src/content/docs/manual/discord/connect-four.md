---
title: "Connect Four"
tableOfContents:
  maxHeadingLevel: 3
---

:::note[Rendered from `docs/discord/connect-four/README.md`]
Generated on every docs build. Edit the source in `docs/`, not here.
:::
Button-driven Connect Four on a 7-wide × 6-tall grid, solo against the bot (`/c4`) or against another member (`/c42`). Players take turns dropping discs until someone connects four or the board fills.

## Command surface

| Command               | Effect                                                                 |
| --------------------- | ---------------------------------------------------------------------- |
| `/c4`                 | Play the bot. You are Red and move first; the bot answers each move.   |
| `/c42 opponent:@user` | Challenge another member. You are Red and move first. You can't challenge yourself or a bot (use `/c4` for that). |

## How it works

The player who ran the command always plays Red (🔴) and moves first; the opponent, or the bot in `/c4`, plays Yellow (🟡). Empty cells render as ⚫.

**The bot (`/c4`).** It replies instantly, in the same button press as your move. It searches six plies ahead with minimax and alpha-beta pruning, trying columns centre-out, and scores positions by open lines of two and three, weighting the centre column and blocking your three-in-a-rows hard ([`connect-four/ai.ts`](../../../bots/discord/src/connect-four/ai.ts)). It is strong enough to punish a missed block, not a perfect player.

After each turn the board is re-drawn as an embed description, with seven column-buttons (labelled 1–7) beneath it. Players click a button to drop their disc into that column. The disc falls to the lowest unfilled row.

**Win condition:** first to place four discs in a straight line — horizontal, vertical, or either diagonal — wins. Draw if the board fills with no winner.

**Turn enforcement:** button presses from anyone other than the current player are rejected with an ephemeral reply.

**Timeout:** if the current player does not move within 90 seconds of their turn starting, their opponent wins by forfeit. The clock restarts after every move. In `/c4` only you can time out. The embed is updated to reflect the result and all buttons are removed.

**State:** entirely in-memory. One game per message ID. No persistence across bot restarts.

## Source layout

| Concern          | Location                                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------- |
| Game logic       | [`bots/discord/src/connect-four/game.ts`](../../../bots/discord/src/connect-four/game.ts)           |
| Bot opponent     | [`bots/discord/src/connect-four/ai.ts`](../../../bots/discord/src/connect-four/ai.ts)               |
| Slash commands (`/c4`, `/c42`) + button handler | [`bots/discord/src/commands/connect-four.ts`](../../../bots/discord/src/commands/connect-four.ts) |
| Command registry | [`bots/discord/src/commands/index.ts`](../../../bots/discord/src/commands/index.ts)                 |
| Button router    | [`bots/discord/src/index.ts`](../../../bots/discord/src/index.ts) (`c4:` prefix)                   |

## Design notes

- **Winning cells highlighted.** When the game ends, the four winning discs render as 🟥 / 🟨 so the line is immediately visible.
- **Column disabled when full.** Columns with no empty rows have their button disabled so players cannot attempt invalid moves.
- **90-second forfeit, not draw.** Inactivity is attributed as a loss rather than a draw, giving the active player a win they earned by showing up.
- **No persistence.** Games are purely in-memory and disappear on bot restart. This matches the spec and keeps the implementation simple; no per-guild JSON file is needed.
- **One active game per message.** The match map is keyed by the reply message ID, so multiple simultaneous games in the same or different channels work without collision.
