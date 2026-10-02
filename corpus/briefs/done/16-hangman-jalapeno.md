# Task 16 — Hangman: "jalapeño" can never be solved

## Context

Source: the 2026-09-26 improvements audit, recorded in [log.md](../../log.md).
Rank 13 of 16. The fix is one character.

The food list at `bots/discord/src/hangman/words.ts:15` contains `'jalapeño'`.
Hangman can never finish that word:

- `commands/hangman.ts:27` ignores any message that isn't a single letter
  matching `/^[a-z]$/`, so players can't guess the ñ.
- `newGame` in `hangman/game.ts:40` hides every character as `_`, the ñ included.
- `applyGuess` (`game.ts:91`) declares a win only when no `_` is left.

Players guess j, a, l, p, e and o, see `j a l a p e _ o`, and can only lose. The
food list has 40 words, so this happens in about 1 of every 40 food games. It is
the only word in the hangman or Wordle lists with a character outside `[a-z]`
(grep, 2026-09-26).

## Files you OWN

- `bots/discord/src/hangman/words.ts`

## What to do

1. Change `'jalapeño'` to `'jalapeno'`.

## Acceptance

- This prints nothing:
  `grep -oP "'[^']+'" bots/discord/src/hangman/words.ts | tr -d "'" | grep -vP '^[a-z]+$'`
- If brief 19 has landed, add a test asserting every hangman word matches
  `/^[a-z]+$/`.

## Outcome (2026-10-02)

`'jalapeño'` is now `'jalapeno'`. The acceptance grep prints nothing: every
hangman word matches `^[a-z]+$`. Brief 19 hasn't landed, so the guard test is
for it to add.
