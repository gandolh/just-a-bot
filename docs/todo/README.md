# Pending features

Each `*.md` in this directory is a self-contained spec for a feature that
hasn't been built yet. Pick one, implement it, then **delete the TODO file
and fold its content into `docs/<feature>/README.md`** so the docs index
stays the single source of truth for what's live.

## Lifecycle

1. Read the TODO file end-to-end. Re-read the "critical files" it lists.
2. Implement under `bots/discord/src/<feature>/` and `bots/discord/src/commands/`.
3. Update `bots/discord/src/commands/index.ts` (and `index.ts` for button /
   message routes, env, intents).
4. Run `npm run typecheck` and `npm run discord:register` for slash defs.
5. Manually exercise the command in a dev guild.
6. **Delete the TODO file.** Create `docs/<feature>/README.md` (mirror the
   structure of `docs/rpg/README.md` — Goal, Command surface, How it works,
   Source layout, Design notes). Add a link from `docs/README.md`.
7. Commit. (User commits — never run `git commit` here.)

## Convention each TODO follows

- **Goal** — one paragraph, user-facing.
- **Command surface** — table of slash commands and effects.
- **Data model** — TS-ish shape, file path under `bots/discord/data/`,
  persistence pattern (wallet flat-file vs RPG per-guild).
- **Interaction flow** — typical session, button prefixes, thread spawns,
  DMs, MessageCreate listeners.
- **Files to add / modify** — paths.
- **Open questions / non-goals** — anything deferred to v2.

## Recommended order (cheapest → most complex)

1. [leaderboards.md](leaderboards.md)
2. [quote-book.md](quote-book.md)
3. [birthdays-and-reminders.md](birthdays-and-reminders.md)
4. [hangman.md](hangman.md)
5. [trivia.md](trivia.md)
6. [img-html-to-png.md](img-html-to-png.md)
7. [rpg-pvp-and-trading.md](rpg-pvp-and-trading.md)
8. [mafia.md](mafia.md)
