# Overview

**just-a-bot** is a personal multi-bot monorepo. The flagship is a feature-rich
**Discord bot** (`@bots/discord`) with music, games, gambling, AI chat, image
generation, reminders, and more. Other workspaces (`@bots/slack`,
`@bots/whatsapp`, `@bots/dice-activity`) are smaller or in-progress siblings.

- **Language/runtime:** TypeScript on Node ≥ 22.12, run directly via `tsx` (no
  build step for the bots). ESM (`"type": "module"`), `.ts` import suffixes.
- **Structure:** npm workspaces — `shared/` (the `@bots/shared` package) +
  `bots/*`. See [architecture.md](architecture.md).
- **Process management:** pm2 via `ecosystem.config.cjs`.

The Discord bot is organized as one feature directory per capability under
`bots/discord/src/` (e.g. `rpg/`, `mafia/`, `trivia/`, `ollama/`), with a thin
slash-command handler per feature in `commands/`.

Key subsystems with their own page:

- [music.md](music.md) — the `/play` music stack (discord-player + yt-dlp).
