# Hangman

Classic hangman in a Discord thread. Anyone in the thread can guess letters; 6 wrong guesses and the gallows fills up.

## Command surface

A single slash command, `/hangman <sub>`:

| Subcommand | Effect |
| --- | --- |
| `/hangman start [category]` | Spawn a thread, pick a random word from the (optionally filtered) word list, post the initial state. |
| `/hangman give-up` | Reveal the word in the current thread, end the game. Only the starter or an admin can call this. |

Letter guesses are typed directly in the thread — no slash command per guess. A single character `a–z` posted in the thread is the guess.

Available categories: `animals`, `food`, `tech`, `countries`, `sports`. If no category is given, one is chosen at random.

## How it works

1. `/hangman start category:animals` picks a random word from the chosen category, opens a thread named `hangman-<category>`, and posts the initial gallows state.

2. A player types a single letter (`a–z`) in the thread:
   - Already guessed → bot reacts `🔁`.
   - Correct → bot reacts `✅`, posts updated state.
   - Wrong → bot reacts `❌`, posts updated state; wrong letter added to the list.
   - 6 wrong guesses → game over, full word revealed, thread archived.
   - All letters revealed → win, thread archived.

3. `/hangman give-up` (starter or admin only) reveals the word and archives the thread immediately.

The game is **cooperative** — the thread is open to everyone.

## Render format

```
Category: animals
Word: _ l _ p h _ n t
Wrong: a, x, z (3/6)

    ┌───┐
    │   O
    │  /|
    │
    │
    └────
```

The gallows progresses through 7 ASCII frames (0–6 wrong guesses).

## Source layout

| Concern | Location |
| --- | --- |
| Word lists by category | [`bots/discord/src/hangman/words.ts`](../../../bots/discord/src/hangman/words.ts) |
| ASCII gallows + state renderer | [`bots/discord/src/hangman/render.ts`](../../../bots/discord/src/hangman/render.ts) |
| Game state machine | [`bots/discord/src/hangman/game.ts`](../../../bots/discord/src/hangman/game.ts) |
| Slash command + message handler | [`bots/discord/src/commands/hangman.ts`](../../../bots/discord/src/commands/hangman.ts) |

## Design notes

- **In-memory only.** Games do not survive a bot restart. Any thread with an active game that outlives a restart will look frozen — this is a known limitation and acceptable given the short game duration.
- **Cooperative by default.** The thread is open to all guild members; no solo mode.
- **Mirrors Wordle's interaction model.** `MessageCreate` events in a thread are checked against `hasHangmanGame` before falling through to other handlers, the same pattern Wordle uses.
- **Static word list.** 40 words per category, bundled in TypeScript. No dictionary API dependency.
- **Thread lifecycle.** On win or loss the thread is archived (not deleted), so the final state stays readable. On `/hangman give-up` the same archive path is taken.
