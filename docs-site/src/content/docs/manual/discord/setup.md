---
title: "Discord — setup & ops"
tableOfContents:
  maxHeadingLevel: 3
---

:::note[Rendered from `docs/discord/setup.md`]
Generated on every docs build. Edit the source in `docs/`, not here.
:::
Install / typecheck steps are in [../common/setup.md](../common/setup.md); this
page covers the bot's own configuration.

## Token

Copy `bots/discord/.env.example` to `bots/discord/.env` and fill in the three
required values:

```
DISCORD_TOKEN=...   # the bot token
CLIENT_ID=...       # the application id (a numeric snowflake)
GUILD_ID=...        # the guild slash commands are registered to
```

`env.ts` validates with zod and fails fast on boot if any of them is missing or
not numeric where it should be. `OLLAMA_API_KEY` (for `/ask`) is optional.

### The Jukebox (optional)

Three more variables connect the bot to atrium's music. Set all three or none:
a partial set stops the bot at boot and names what is missing. With none set,
the Jukebox reports "not configured" and the rest of the bot runs as usual.

```
JUKEBOX_ATRIUM_URL=https://example.com/atrium-api   # atrium's API root
JUKEBOX_ATRIUM_USERNAME=discord-bot                # the bot's own atrium user
JUKEBOX_ATRIUM_PASSWORD=...                        # its password, only in .env
```

The user is a local atrium account (not a Ward one) with the role `jukebox`,
which limits it to the Jukebox. Atrium's owner seeds it. A local dev bot gets
its own user (`discord-bot-dev`), so the two never share a session.

**The deploy pushes `bots/discord/.env` to the server as it is**, so that file
holds the production values. For a local run against the local
atrium, give the three variables on the command line instead; they win over the
file:

```
JUKEBOX_ATRIUM_URL=http://localhost:5173/atrium-api \
JUKEBOX_ATRIUM_USERNAME=discord-bot-dev JUKEBOX_ATRIUM_PASSWORD=... \
npm run discord:jukebox-check
```

Check the setup without starting the bot:

```
npm run discord:jukebox-check
```

It logs in, calls atrium's `/health` (200), drops the session and calls it
again to see a fresh login, then calls `/library`, which must answer 403
`JUKEBOX_ROLE_FORBIDDEN`, and logs out. It keeps its session in memory, so it
is safe beside a running bot. A refused password is tried once and not again
until a restart, because atrium locks an address out after five failed
sign-ins.

## Register slash commands

Slash commands are registered **per guild** for fast propagation during
development. Re-run whenever command shapes change (new command, new option,
renamed choice, etc.).

```
npm run discord:register
```

Editing a command body without changing its slash definition does **not**
require re-registering.

## Run

Dev (auto-reload via tsx watch):

```
npm run discord:dev
```

Production (no watcher):

```
npm run discord:start
```

Both run TypeScript directly through tsx — no build step.

## Data directories

Runtime state lives under `bots/discord/data/` and is gitignored.

| Path | What |
| --- | --- |
| `bots/discord/data/wallets.json` | Per-user gambling balances |
| `bots/discord/data/rpg/<guild-id>.json` | One RPG world per Discord guild |

Wiping a file resets that feature's state. RPG worlds can be hand-edited or
piped to an LLM directly; the data model is described in
[rpg/README.md](rpg/README.md).
