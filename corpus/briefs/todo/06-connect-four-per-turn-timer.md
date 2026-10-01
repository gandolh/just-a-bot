# Task 06 — Connect Four: make the 90-second timer per turn, as documented

## Context

Source: the 2026-09-26 improvements audit, recorded in [log.md](../../log.md).
Rank 3 of 16.

`bots/discord/src/commands/connect-four.ts:94-115` arms one 90 s timer when the
match starts. The move handler (`handleConnectFourButton`, `:30-63`) never clears
or re-arms it, and `finalize` (`:25-28`) clears it only when the game ends. The
docs describe a per-turn timer: "if the current player does not move within 90
seconds, their opponent wins by forfeit" (`docs/discord/connect-four/README.md:21`).

The result is that every game longer than 90 s in total ends in a bogus forfeit.
In `/c42`, if both players move every 10-15 s, the timer fires at t=90 s anyway.
It marks the game finished and edits the message to "⏱️ X ran out of time — Y
wins!" even though X moved 2 s earlier. In solo `/c4` the bot moves instantly, so
the human loses once their total thinking time passes 90 s.

## Files you OWN

- `bots/discord/src/commands/connect-four.ts`
- `bots/discord/src/connect-four/view.ts`, only if the `Match.timeoutHandle` type
  needs to allow `undefined`

## Files you must NOT touch

- `connect-four/game.ts`, `connect-four/ai.ts`

## What to do

1. Move the timeout body into
   `armTurnTimer(messageId: string, match: Match, message: Message)`. It should
   `clearTimeout(match.timeoutHandle)`, then arm a fresh 90 s timer running the
   existing body (look up the match, mark it finished, edit `message` with the
   forfeit embed), and store the handle on `match`.
2. In `startMatch`, call it with `reply.resource.message`. Drop the placeholder
   `setTimeout(() => {}, 0)` at `:81`.
3. In `handleConnectFourButton`, once the move is done (and the bot's reply move
   in solo mode, `:52-56`), call
   `armTurnTimer(interaction.message.id, match, interaction.message)` if the game
   isn't finished.
4. Leave `finalize` as it is.

## Acceptance

- `npm run typecheck` clean.
- On the dev application, start `/c4`, wait about 60 s, move, wait about 60 s,
  move again. There's no forfeit, where before the fix the game was forfeited at
  90 s in total.
- Wait more than 90 s on your turn. The game ends with the "ran out of time"
  forfeit the docs describe. No docs change is needed.
