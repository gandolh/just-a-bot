# Task 22 — `docs/`: fix the `/c4` page, document `/c42`, and add Wordle and tic-tac-toe pages

## Context

Source: the second 2026-09-26 improvements pass, recorded in [log.md](../../log.md).
Rank 4 of the second pass.

Brief [11](../done/11-docs-drift.md) fixes five places where `docs/` contradicts the
code. This brief covers two gaps it doesn't list, both checked against the code
on 2026-09-26. `docs/` is also published as the manual on the docs site, so
players read these pages.

**1. The Connect Four page documents a command that doesn't exist.**
`docs/discord/connect-four/README.md:3` and `:9` say `/c4 @opponent` starts a
two-player game, and the feature index repeats it at `docs/discord/README.md:30`.
The real `/c4` takes no options and plays you against the bot
(`bots/discord/src/commands/connect-four.ts:119-128`). The two-player command is
`/c42 opponent:@user` (`:130-136`), and nothing under `docs/` mentions it. A
player who follows the page gets an option error and never finds the command
they wanted.

**2. Two registered games have no docs.** `/wordle` and `/tictactoe` are
registered (`commands/index.ts:31`) and listed in `/help`, but `docs/` has no page
for either and the feature index in `docs/discord/README.md` leaves them out.
They only come up in passing (`docs/discord/hangman/README.md:63`,
`docs/discord/architecture.md:37` and `:43`).

## Files you OWN

- `docs/discord/connect-four/README.md`
- `docs/discord/README.md`: the Connect Four line and two new index entries
- `docs/discord/wordle/README.md` (new)
- `docs/discord/tictactoe/README.md` (new)
- `docs-site/src/content/docs/manual/**`, regenerated only, never hand-edited

## Files you must NOT touch

- `bots/` and `shared/`. This brief changes documentation only.
- The five items brief 11 owns. Brief 11 also edits `docs/discord/README.md` and
  regenerates the manual, so don't run the two in the same wave.
- The Connect Four timer wording. The page already describes a per-turn 90 s
  timer (`connect-four/README.md:21`), which is what brief 06 makes true.

## What to do

1. **Connect Four.** Split the command table into `/c4`, a solo game against
   the bot, and `/c42 opponent`, a challenge to another member. Read
   `commands/connect-four.ts` for who moves first and how the bot replies, and
   `connect-four/ai.ts` for how the bot picks moves. Fix the feature-index line
   so it names both commands.
2. **Wordle page.** Read `commands/wordle.ts` and `wordle/game.ts`. Cover how a
   game starts (it opens a thread), how to guess (type a word in the thread),
   what typing `delete` does, how many attempts there are, where the word list
   comes from (`wordle/words.ts`), and that the game lives in memory, so a bot
   restart ends it.
3. **Tic-tac-toe page.** Read `commands/tictactoe.ts` and `tictactoe/game.ts`.
   Cover `/tictactoe` with and without its optional `opponent`, who moves first,
   and what happens to a game nobody finishes.
4. Follow the layout of an existing page such as `docs/discord/hangman/README.md`,
   and add both games to the feature index.
5. Run `npm run sync-corpus -w @bots/docs-site`. The sidebar autogenerates from
   `manual/discord` (`docs-site/astro.config.mjs:62-63`), so the new pages need
   no config change.

## Acceptance

- `grep -rn "c4 @opponent" docs/` returns nothing.
- `grep -rln "c42" docs/` lists the Connect Four page and `docs/discord/README.md`.
- Both new pages exist and `docs/discord/README.md` links to them.
- Every command option the pages mention exists in that command's
  `SlashCommandBuilder`.
- The regenerated `manual/` diff mirrors the `docs/` diff, and
  `npm run docs -w @bots/docs-site` builds with the two new pages in the sidebar.
