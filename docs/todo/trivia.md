# Trivia

## Goal

Multiple-choice trivia powered by [Open Trivia DB](https://opentdb.com/)
(free, no API key). Post a question with four buttons (A/B/C/D), first
correct answer in 20 seconds wins.

## Command surface

| Command | Effect |
| --- | --- |
| `/trivia start [category] [difficulty]` | Fetch one question, post with buttons. |

Categories and difficulties are slash-option choices populated from the
OpenTDB category list (hard-coded to avoid a startup network call).

## Data model

**In-memory only.**

```ts
type TriviaSession = {
  id: string;            // crypto.randomUUID().slice(0, 8)
  channelId: string;
  messageId: string;
  question: string;
  options: string[];     // length 4, already shuffled
  correctIdx: number;
  category: string;
  difficulty: 'easy' | 'medium' | 'hard';
  startedAt: number;     // Date.now() ms
  expiresAt: number;
  winner: string | null;
};

const sessions = new Map<string, TriviaSession>();  // keyed by id
```

No persistence v1. Score tracking is a v2 hook.

## Interaction flow

1. `/trivia start category:science difficulty:medium`:
   - `await interaction.deferReply()` while fetching.
   - GET `https://opentdb.com/api.php?amount=1&type=multiple&category=<id>&difficulty=<d>`.
     - On HTTP error or `response_code !== 0`, fall back to a bundled
       static question set (`bots/discord/src/trivia/fallback.ts`, ~50
       items hand-written, categorized).
   - Decode HTML entities in question + answers (OpenTDB returns
     HTML-encoded text). Use a small helper, no dep needed.
   - Shuffle correct + 3 incorrect, record `correctIdx`.
   - Post the question as an embed; add 4 buttons with custom IDs
     `trv:<sessionId>:0` … `trv:<sessionId>:3`.
   - `sessions.set(id, ...)`. Schedule a `setTimeout(20_000)` to expire.
2. Player clicks a button:
   - Look up session by ID.
   - If `winner !== null` or `now > expiresAt` → ephemeral "too late".
   - If chosen index matches `correctIdx`:
     - `session.winner = userId`
     - Edit the original message: replace buttons with disabled,
       highlight the correct one (`ButtonStyle.Success`), add a footer
       "🏆 <user> got it!"
   - If wrong: ephemeral reply "Not quite. Try again." (do NOT remove
     buttons; others can still guess).
3. Timer expires:
   - If still no winner: edit message to disable buttons, highlight
     correct, footer "⏱️ time's up — answer was <correct>".
   - `sessions.delete(id)`.

### Routing

Add a `trv:` button prefix branch in [bots/discord/src/index.ts](../../bots/discord/src/index.ts):

```ts
} else if (interaction.customId.startsWith('trv:')) {
  await handleTriviaButton(interaction);
}
```

## Files to add / modify

**New:**
- `bots/discord/src/trivia/api.ts` — `fetchQuestion(category?, difficulty?)`
  with fallback.
- `bots/discord/src/trivia/fallback.ts` — bundled static questions.
- `bots/discord/src/trivia/decode.ts` — HTML entity decoder.
- `bots/discord/src/trivia/render.ts` — embed + button builders.
- `bots/discord/src/commands/trivia.ts` — slash + `handleTriviaButton`.

**Modified:**
- `bots/discord/src/commands/index.ts` — register `/trivia`.
- `bots/discord/src/index.ts` — `trv:` button prefix.

## Open questions / non-goals

- **Score tracking**: v1 = none. v2 = write to `data/trivia/<guildId>.json`
  with `Record<userId, { wins, attempts }>`, feeds into `/top trivia`.
- **Custom question sets** (per guild): v2.
- **True/false questions**: v2 (OpenTDB supports `type=boolean`; would
  need a separate button layout).
- **Concurrency**: multiple `/trivia start` in the same channel run as
  separate sessions, identified by ID in the button payload. No locking.

## Done

Delete this file. Create `docs/trivia/README.md`.
