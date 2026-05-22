# Hangman

## Goal

Classic hangman in a Discord thread. Anyone in the thread can guess
letters; 6 wrong guesses and the gallows fills up.

Mirrors the existing wordle thread game ([bots/discord/src/commands/wordle.ts](../../bots/discord/src/commands/wordle.ts))
— same interaction model, simpler rules.

## Command surface

| Command | Effect |
| --- | --- |
| `/hangman start [category]` | Spawn a thread, pick a random word from the (optionally filtered) word list, post the initial state. |
| `/hangman give-up` | Reveal the word in the current thread, end the game. Only the starter (or admin) can call this. |

Letter guesses are typed directly in the thread — no slash command per
guess. A single character `a–z` posted in the thread is the guess.

## Data model

**In-memory only**, no persistence (wordle doesn't persist either).

```ts
type HangmanGame = {
  threadId: string;
  parentChannelId: string;
  starterId: string;
  word: string;             // lowercase
  category: string;
  revealed: string[];       // ['_', 'a', '_', '_', 'e']
  wrongLetters: string[];   // sorted, unique
  guessedLetters: Set<string>;
  maxWrong: number;         // 6
  state: 'active' | 'won' | 'lost';
  startedAt: string;
};

const games = new Map<string, HangmanGame>();  // keyed by threadId
```

Word list is a bundled TS file:

```ts
// bots/discord/src/hangman/words.ts
export const WORDS: Record<string, string[]> = {
  animals: ['elephant', 'giraffe', ...],
  food:    ['pineapple', 'broccoli', ...],
  tech:    ['typescript', 'kubernetes', ...],
};
```

## Interaction flow

1. `/hangman start category:animals`:
   - Pick random word from the category (or any category if omitted).
   - `interaction.channel.threads.create({ name: 'hangman-<word-length>' })`.
   - Reply ephemerally with the thread link.
   - Post the initial state inside the thread (see render below).
   - `games.set(thread.id, { ... })`.

2. Player types `a` in the thread (single letter, a–z, case insensitive):
   - `handleHangmanMessage(message)` checks `hasHangmanGame(message.channelId)`.
   - Ignore non-single-letter messages.
   - If already guessed → react `🔁` and return.
   - Reveal occurrences in `revealed`, or append to `wrongLetters`.
   - Edit the bot's first message in the thread with the new state (or
     post a new state message each turn — wordle posts new each guess;
     mirror that for simplicity).
   - If `revealed` has no `_` left → `state = 'won'`, post "🎉 <starter>
     team got it!".
   - If `wrongLetters.length >= maxWrong` → `state = 'lost'`, reveal word,
     post the full gallows.
   - On either end: archive the thread, `games.delete(threadId)`.

3. Render:
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
   Bundled 7-frame ASCII gallows: empty → head → torso → arms → leg →
   leg → done. Index by `wrongLetters.length`.

### Routing

Register a `MessageCreate` branch alongside wordle's in [bots/discord/src/index.ts](../../bots/discord/src/index.ts):

```ts
if (message.channel.isThread()) {
  if (hasWordleGame(message.channelId)) { await handleWordleMessage(message); return; }
  if (hasHangmanGame(message.channelId)) { await handleHangmanMessage(message); return; }
}
```

## Files to add / modify

**New:**
- `bots/discord/src/hangman/words.ts` — word list by category.
- `bots/discord/src/hangman/render.ts` — `renderState(game)` returns the
  string for the state message + the gallows ASCII.
- `bots/discord/src/hangman/game.ts` — state machine.
- `bots/discord/src/commands/hangman.ts` — slash command +
  `handleHangmanMessage` + `hasHangmanGame` exports.

**Modified:**
- `bots/discord/src/commands/index.ts` — register `/hangman`.
- `bots/discord/src/index.ts` — add the `hasHangmanGame` branch in the
  thread-message dispatcher.

## Open questions / non-goals

- **Persistence**: no. Threads with active games that survive a bot
  restart will look frozen. Document this as a known limitation.
- **Player stats / wins**: v2 (would need persistence + cross-link with
  `/top`).
- **Solo vs cooperative**: thread is open to anyone — cooperative by
  default. No solo mode.
- **Word source**: bundled static list. No dictionary API.

## Done

Delete this file. Create `docs/hangman/README.md`.
