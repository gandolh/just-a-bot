# `/wordle` — thread-based Wordle

## Surface

| Command | What it does |
| --- | --- |
| `/wordle` | Posts a "Wordle started" message in the channel and starts a thread under it. |
| `@bot <5-letter-word>` (in the thread) | Submit a guess. |

Any participant in the thread can submit a guess — the game is shared, not
locked to the starter. Results render with `:large_green_square:` /
`:large_yellow_square:` / `:black_large_square:` squares plus the letters in
inline code so the colorblind story is the same as on Discord.

On win or loss the bot posts a recap into the parent channel (`@<starter>
solved in N/6`, or `the word was X`) and clears the in-memory game.

## Why `@mention` instead of plain replies

Discord's port reads every thread message; that requires `channels:history`
and the `message.channels` event subscription on Slack. Sticking to
`app_mention` means the bot keeps the same permission footprint as the rest
of the surface — slight UX hit (`@bot apple` vs just `apple`), but no extra
scopes.

## Source

| What | Where |
| --- | --- |
| Game logic (pure) | [`bots/slack/src/wordle/game.ts`](../../../bots/slack/src/wordle/game.ts) |
| Word list | [`bots/slack/src/wordle/words.ts`](../../../bots/slack/src/wordle/words.ts) |
| Slack glue + thread registry | [`bots/slack/src/wordle/slack.ts`](../../../bots/slack/src/wordle/slack.ts) |
| Slash + `app_mention` wiring | [`bots/slack/src/index.ts`](../../../bots/slack/src/index.ts) |

## Notes

- **In-memory state.** A restart wipes active games. Thread will still be
  there in Slack but the bot will no longer recognize guesses.
- **Word list is duplicated** from `bots/discord/src/wordle/words.ts` — the
  list is small enough that copying beats abstracting into `shared/`.
