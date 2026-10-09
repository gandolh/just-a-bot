---
summary: What just-a-bot is: a personal, feature-rich Discord bot in an npm-workspaces repo (bot, shared library, docs site); the orientation page and the map of what lives where.
updated: 2026-10-09
---

# Overview

**just-a-bot** is a personal **Discord bot** (`@bots/discord`) with games,
gambling, AI chat, image generation, reminders and an RPG world. It also plays
music in voice: the Jukebox, a speaker that atrium steers (see
[jukebox.md](jukebox.md)). A D&D layer
and an Instagram `/post` command were hidden for months and deleted on
2026-10-06 — see [decisions.md](decisions.md).

It *was* a multi-bot monorepo — Slack, WhatsApp and a dice-table voice Activity
lived here until 2026-08-27, when they were removed to make this a Discord-only
repo ([decisions.md](decisions.md)). `shared/` stays a separate workspace because
it holds code with no Discord dependency, and the boundary enforces that.

- **Language/runtime:** TypeScript on Node ≥ 22.12, run directly via `tsx` (no
  build step for the bots). ESM (`"type": "module"`), `.ts` import suffixes.
- **Structure:** npm workspaces — `shared/` (the `@bots/shared` package),
  `bots/discord`, and `docs-site/` (the build-time documentation site, not a
  runtime). See [architecture.md](architecture.md).
- **Process management:** pm2 via `ecosystem.config.cjs`.

The Discord bot is organized as one feature directory per capability under
`bots/discord/src/` (e.g. `rpg/`, `mafia/`, `trivia/`, `ollama/`), with a thin
slash-command handler per feature in `commands/`.

No subsystem has its own wiki page yet. Most features are **not** catalogued here; pages get added as work touches
them. In the meantime their operating manuals live in
[`docs/`](../../docs/README.md) — one directory per feature. `docs/` is the
*how*, this wiki is the *why*, and `docs/` ranks last when they disagree.
