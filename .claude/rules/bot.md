---
paths:
  - "bots/**"
  - "shared/**"
---

# The bot (`bots/discord`, `shared`)

The commands and the safety rule are in [CLAUDE.md](../../CLAUDE.md); the
locked calls in [decisions.md](../../corpus/wiki/decisions.md); the terms in
[glossary.md](../../corpus/wiki/glossary.md).

- **Never read or print a `.env`.** `bots/discord/.env` holds production
  values in a working checkout.
- **Tests run through `npm run test:clean`**, never `npm test` or a test file
  by hand: `bots/discord/src/env.ts` loads that `.env` the moment anything
  imports it.
- **Never start the bot locally.** One running instance per bot token:
  Discord sends every interaction to every live session.
- There is no build step: `tsx` runs the TypeScript as it is, in dev and in
  the container. Relative imports keep their `.ts` suffix.
- There is no database. State is gitignored JSON under `bots/data/` (shared)
  and `bots/discord/data/` (bot-local).
- `shared/src/env.ts` (`loadEnv`) is the only reader of `process.env`; the bot
  takes its settings from the parsed `env` in `bots/discord/src/env.ts`.
- Output goes through the logger (`logger.scoped` from `@bots/shared`). The
  Jukebox check CLI is the one other file that prints.
- A guild-only slash command checks `interaction.inGuild()` once and hands its
  handlers a `GuildCommandInteraction` (`commands/types.ts`), so
  `interaction.guildId` is a string there. Don't write `guildId!`.
- A `!` is an error in source and a warning in tests; narrow with a guard.
