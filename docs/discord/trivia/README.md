# Trivia

Multiple-choice trivia powered by [Open Trivia DB](https://opentdb.com/) (free,
no API key needed). One player starts a round; anyone in the channel can be first
to answer within 20 seconds. The bot posts a question as an embed with four A/B/C/D
buttons, announces the winner instantly, and disables the buttons when time runs out.

## Command surface

| Command | Effect |
| ------- | ------ |
| `/trivia [category] [difficulty]` | Fetch one question and post it with four answer buttons. |

`category` and `difficulty` are optional slash-option choices. Categories map to
OpenTDB's category IDs (hard-coded at startup to avoid a network call on boot).

## How it works

1. `/trivia start` defers the reply while fetching from OpenTDB.
2. The bot GETs `https://opentdb.com/api.php?amount=1&type=multiple&…`. On any
   network error or non-zero `response_code`, it silently falls back to a bundled
   set of ~50 hand-written questions.
3. HTML entities in the question and answers are decoded with a small helper
   (no extra dependencies).
4. The four answers (correct + 3 incorrect) are shuffled; `correctIdx` records
   where the correct answer landed.
5. The embed is posted with buttons `trv:<sessionId>:0` … `trv:<sessionId>:3`.
   A 20-second `setTimeout` is scheduled to expire the session.
6. **Correct answer clicked**: the session is closed immediately, buttons are
   disabled (correct = green, others = grey), footer shows the winner.
7. **Wrong answer clicked**: ephemeral reply "Not quite. Try again." — buttons
   stay active so others can still answer.
8. **Timer fires with no winner**: the bot edits the original message to disable
   buttons, highlight the correct answer, and show "⏱️ Time's up".

All state is in-memory. No disk persistence in v1.

## Source layout

| Concern | Location |
| ------- | -------- |
| Session type + store | [`bots/discord/src/trivia/session.ts`](../../../bots/discord/src/trivia/session.ts) |
| OpenTDB fetch + fallback dispatch | [`bots/discord/src/trivia/api.ts`](../../../bots/discord/src/trivia/api.ts) |
| Bundled fallback questions (~50) | [`bots/discord/src/trivia/fallback.ts`](../../../bots/discord/src/trivia/fallback.ts) |
| HTML entity decoder | [`bots/discord/src/trivia/decode.ts`](../../../bots/discord/src/trivia/decode.ts) |
| Embed + button builders | [`bots/discord/src/trivia/render.ts`](../../../bots/discord/src/trivia/render.ts) |
| Slash command + button handler | [`bots/discord/src/commands/trivia.ts`](../../../bots/discord/src/commands/trivia.ts) |

## Design notes

- **No API key.** OpenTDB's free tier is plenty for a Discord bot. Rate limits
  would only matter under sustained rapid use; the fallback set covers any
  transient failures.
- **In-memory sessions only.** Sessions live for at most 20 seconds, so there is
  no value in writing them to disk. Score tracking (v2) will use
  `data/trivia/<guildId>.json`.
- **Concurrent sessions.** Multiple `/trivia` calls in the same channel run as
  independent sessions keyed by a short random ID embedded in each button's
  `customId`. No locking required.
- **Timer edits the original reply.** The `ChatInputCommandInteraction` is stored
  on the session so the expiry `setTimeout` can call `editReply`. Interaction
  tokens last 15 minutes, well beyond the 20-second window.
- **Four-button layout in one action row.** Discord limits action rows to 5
  buttons; ABCD fits cleanly in a single row.
