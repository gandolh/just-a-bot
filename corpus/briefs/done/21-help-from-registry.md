# Task 21 — `/help`: build the list from the registered commands, so it can't advertise dead ones

## Context

Source: the second 2026-09-26 improvements pass, recorded in [log.md](../../log.md).
Rank 3 of the second pass.

`/help` is a hand-written list in `bots/discord/src/commands/help.ts:16-89`, and
it has drifted from `commands/index.ts:29-43` in both directions. A diff of the
builders' `.setName(...)` against the help entries on 2026-09-26 found:

- **7 commands that don't exist.** The Music group (`help.ts:17-30`) lists
  `/play`, `/skip`, `/pause`, `/resume`, `/stop`, `/queue` and `/nowplaying`.
  Music was removed on 2026-08-27 ([decisions.md](../../wiki/decisions.md),
  "Music subsystem removed entirely").
- **11 of the 25 registered commands missing:** `/birthday`, `/clock`,
  `/confess`, `/give`, `/hangman`, `/img`, `/mafia`, `/quote`, `/remindme`,
  `/top` and `/trivia`. The "Save Quote" message menu isn't mentioned either.

So a member who runs `/help` is told to try seven commands that fail, and never
hears about most of the social features. Every feature added since the list was
written got left out, and the music removal never touched it. A hand-kept list
will drift again.

A parity test alone won't hold it. Importing `commands/index.ts` pulls in
`commands/ask.ts`, which imports `env.ts`, so the test would need a bot `.env`.
Building the list from the registry at runtime removes the drift instead.

## Files you OWN

- `bots/discord/src/commands/help.ts`
- `bots/discord/src/commands/index.ts`, one call after `all` and
  `allContextMenus` are built

## Files you must NOT touch

- Other command files. The descriptions `/help` shows come from their existing
  `.setDescription(...)` calls. If one reads badly in the list, note it in the
  log rather than editing it here.
- The commented-out D&D block in `help.ts:66-79`. `/dnd`'s fate is the open
  question in [open-questions.md](../../wiki/open-questions.md). Leave the block
  where it is.
- `bots/discord/src/index.ts`. Briefs 04, 05, 17 and 18 edit it.

## What to do

1. In `help.ts`, export `setHelpCatalog(commands: readonly Command[], menus: readonly ContextMenuCommand[])`,
   which stores both lists in module variables. Call it in `commands/index.ts`
   once `all` and `allContextMenus` exist. The call goes one way, from index to
   help, so there is no import cycle.
2. Replace the hand-written entries with a category map from command name to
   group, keeping the current group titles and emoji for Gambling, Games, RPG
   and Misc. Add groups for the rest, for example "Social" (`quote`, `confess`,
   `birthday`, `remindme`, `clock`), "AI and images" (`ask`, `img`) and
   "Leaderboards" (`top`). Put `mafia`, `hangman` and `trivia` under Games and
   `give` under Gambling. Drop the Music group.
3. Build each line from `command.data.toJSON()`. For a command with
   subcommands, list one line per subcommand, as `/coins balance` and
   `/coins add` are today. Otherwise list `/name — description`.
4. Any registered command missing from the map goes into a final "Other" group,
   so a new command still shows up before anyone updates the map.
5. Keep RPG's hand-written text block (`help.ts:53-65`). It explains the game
   better than a subcommand list. List "Save Quote" (message menu) under Social.
6. Discord's embed limits apply: at most 25 fields, 1024 characters per field
   value and 6000 characters in total. Split a group into a second field if it
   passes 1024. Export the field builder as a pure `buildHelpFields()` so it can
   be checked without a client.

## Acceptance

- `npm run typecheck` clean.
- A tsx scratch script run with dummy env vars
  (`DISCORD_TOKEN=x CLIENT_ID=1 GUILD_ID=1`) imports `commands/index.ts` and calls
  `buildHelpFields()`. It checks:
  - every name in `commands` appears in the output, and `/play` doesn't
  - no field value is over 1024 characters, the total is at most 6000, and
    there are at most 25 fields
- If brief 19 has landed, make that a `commands/help.test.ts` that sets the three
  env vars before a dynamic import, instead of a scratch script.
- On the dev application, `/help` shows every group with no Music section.

## Outcome (2026-10-02)

`/help` is built from the registry. `commands/index.ts` calls
`setHelpCatalog(all, allContextMenus)`, and `help.ts` maps command names to
groups:
- Gambling (with `give`) and Games (with `mafia`, `hangman`, `trivia`)
- RPG, which keeps its hand-written text
- Social: `quote`, `confess`, `birthday`, `remindme`, `clock` and the Save
  Quote menu
- AI and images (`ask`, `img`), Leaderboards (`top`) and Misc
- Other, a catch-all for anything unmapped

Lines come from `data.toJSON()`, one per subcommand (subcommand groups
included). The Music group is gone. `buildHelpFields()` is pure and packs a
group into extra "(cont.)" fields past 1024 characters, capped at 25 fields.
The commented D&D block is kept as a comment in `help.ts`.

Verified: `npm run typecheck` is clean, and the new `commands/help.test.ts`
(dummy env vars, then a dynamic import of the real registry) asserts every
registered command and menu appears, `/play` and Music don't, and the embed
limits hold. `npm test` passes 22 + 4. The rendered list was printed and read:
Social is the largest field at 1005 of 1024 characters, so the next social
command will spill into a "(cont.)" field by design.

Descriptions that read oddly in the list (not edited, per the brief):
`/hangman start` is the only Hangman entry, and `/ping`'s "Replies with Pong!"
says little in a help list. **Not verified live:** `/help` on the dev app.
