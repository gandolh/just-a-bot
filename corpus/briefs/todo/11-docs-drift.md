# Task 11 — `docs/`: fix the pages that contradict the code

## Context

Source: the 2026-09-26 improvements audit, recorded in [log.md](../../log.md).
Rank 8 of 16.

Every claim below was checked against the code on 2026-09-26. `docs/` ranks last
in the source-of-truth order (root `CLAUDE.md`), and these five places now
mislead the people it's written for.

1. **The setup page blocks a fresh install.** `docs/discord/setup.md:8-13` says to
   set `DISCORD_TOKEN` and `DISCORD_CLIENT_ID`. `bots/discord/src/env.ts:9-12`
   requires `CLIENT_ID`, a different name, plus `GUILD_ID`, which the page never
   mentions. Someone following the page gets a Zod validation failure at boot.
   `bots/discord/.env.example` has the right names.
2. **Registered commands are missing from the lists.** The table in
   `docs/discord/gambling/README.md:9-17` and the feature index at
   `docs/discord/README.md:17` list `/coins`, `/slots`, `/blackjack` and `/dice`.
   They omit `/blackjack2` and `/dice2`, both registered at
   `commands/index.ts:31`. Check whether `/give` is listed anywhere as well.
3. **`/post` image size.** `docs/discord/post/README.md:8` and `:67`, plus
   `docs/discord/README.md:26`, say `/post` renders 1080×1080.
   `commands/post.ts:19` has `const SIZE = 256`, and the subcommand descriptions
   say 256×256. Line 67 calls the output "well within" Instagram's limits, yet
   256 px is below the 320 px minimum that same line states. `/post` is hidden,
   and its fate is an open question
   ([open-questions.md](../../wiki/open-questions.md)). So fix the doc and point
   out the 256 < 320 problem on the page, but don't change the code.
4. **Stale "future work".** The "Cross-feature hooks" section in
   `docs/discord/img/README.md:104-112` describes `/top` and `/quote random` image
   options as future work "once the leaderboard / quote-book feature ships". It
   links `docs/todo/leaderboards.md` and `docs/todo/quote-book.md`, and neither
   file exists. Both features have shipped, and a grep on 2026-09-26 found no
   image or card option on `commands/top.ts` or `commands/quote.ts`. Rewrite the
   section to say what exists. The `/post` bullet in the same section also says
   1080×1080.
5. **Workspace count.** `docs/common/setup.md:9` and `:17` say the repo has two
   workspaces. Root `package.json:8-12` lists three, since `docs-site` joined on
   2026-09-07. Add it along with its build command
   (`npm run docs -w @bots/docs-site`), and note that `npm install` now installs
   the Astro toolchain too.

`docs-site/scripts/sync-corpus.mjs` regenerates
`docs-site/src/content/docs/manual/` from `docs/` on every docs build. That
directory is still committed (`docs-site/.gitignore` ignores only `wiki/`), so the
committed copies go stale unless you re-sync them after editing.

## Files you OWN

- `docs/discord/setup.md`
- `docs/discord/README.md`
- `docs/discord/gambling/README.md`
- `docs/discord/post/README.md`
- `docs/discord/img/README.md`
- `docs/common/setup.md`
- `docs-site/src/content/docs/manual/**`, regenerated only, never hand-edited

## Files you must NOT touch

- `bots/` and `shared/`. This brief changes documentation only.
- `corpus/`. Brief 12 covers it.
- `docs-site/scripts/`

## What to do

1. Fix each of the five items so it matches the cited code. For `/blackjack2` and
   `/dice2`, read `commands/blackjack2.ts` and `commands/dice2.ts` and describe
   what they actually do.
2. Run `npm run sync-corpus -w @bots/docs-site` so the committed `manual/` copies
   match `docs/`.

## Acceptance

- Each of the five items matches the file and line it cites.
- `grep -rn "DISCORD_CLIENT_ID\|docs/todo/" docs/` returns nothing.
- `grep -rn "1080" docs/` returns only mentions you kept on purpose.
- The regenerated `manual/` diff mirrors the `docs/` diff.
