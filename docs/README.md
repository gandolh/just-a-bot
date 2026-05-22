# Docs

Project documentation, organized by where the code lives. Written for future me.

## Sections

- **[Common](common/)** — cross-bot patterns
  - [Architecture](common/architecture.md) — monorepo, runtime, shared package, persistence philosophy
  - [Setup](common/setup.md) — install + typecheck across workspaces
- **[Discord bot](discord/)** — `bots/discord/`, all features
  - [Index](discord/README.md) · [Architecture](discord/architecture.md) · [Setup](discord/setup.md)
- **[Slack bot](slack/)** — `bots/slack/`
  - [Index](slack/README.md) — includes Slack-specific setup

The split mirrors the source tree: anything platform-specific (button
prefixes, embeds vs Block Kit, register-per-guild flow) lives under its bot's
folder; anything that applies to every bot lives under `common/`.
