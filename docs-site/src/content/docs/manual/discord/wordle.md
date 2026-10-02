---
title: "Wordle"
tableOfContents:
  maxHeadingLevel: 3
---

:::note[Rendered from `docs/discord/wordle/README.md`]
Generated on every docs build. Edit the source in `docs/`, not here.
:::
Guess a five-letter word in six tries, in a thread of its own.

## Command surface

| Command   | Effect |
| --------- | ------ |
| `/wordle` | Post a "Wordle started" message and open a thread on it for the game. Only works in a regular text channel. |

Guesses are typed in the thread, with no slash command per guess.

## How it works

1. `/wordle` picks a random target from the word list and opens a thread named `Wordle - <your username>` under the start message.
2. Anyone in the thread can type a guess. A guess must be letters only, exactly five of them, and in the word list. Anything else gets a reply explaining why and doesn't use up a try.
3. The bot answers each guess with a row of squares and the tries left:
   - 🟩 right letter, right spot
   - 🟨 right letter, wrong spot
   - ⬛ not in the word

   Repeated letters are marked only as many times as the word contains them: guessing `geese` against `sheep` marks one E green, one yellow, and the third grey.
4. Solve it, or use all six tries, and the result (who started, the score, every row) is posted in the original channel and the thread is deleted.

**`delete`:** typing `delete` in the thread removes it early. Only the player who started the game can delete an unfinished one. The bot needs **Manage Threads**; without it, it replies with the permission error.

## Word list

[`wordle/words.ts`](../../../bots/discord/src/wordle/words.ts): about 480 common five-letter English words. The same list is both the pool of targets and the set of accepted guesses, so a real word that isn't in it is rejected as "not in my word list".

## State

In memory only, keyed by thread. A bot restart ends every game in progress: the thread stays, but guesses in it are ignored.

## Source layout

| Concern | Location |
| --- | --- |
| Rules (scoring, attempts) | [`bots/discord/src/wordle/game.ts`](../../../bots/discord/src/wordle/game.ts) |
| Word list | [`bots/discord/src/wordle/words.ts`](../../../bots/discord/src/wordle/words.ts) |
| Slash command + thread handler | [`bots/discord/src/commands/wordle.ts`](../../../bots/discord/src/commands/wordle.ts) |
| Thread-message routing | [`bots/discord/src/index.ts`](../../../bots/discord/src/index.ts) (MessageCreate) |
