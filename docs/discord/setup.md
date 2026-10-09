# Discord — setup & ops

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

Four more variables connect the bot to atrium's music. Set all four or none:
a partial set stops the bot at boot and names what is missing. With none set,
the Jukebox reports "not configured" and the rest of the bot runs as usual.

```
JUKEBOX_ATRIUM_URL=https://gandolh.ro/atrium-api   # atrium's API root
JUKEBOX_WARD_URL=https://gandolh.ro/ward-api       # Ward's API root
JUKEBOX_WARD_USERNAME=discord-bot                  # the bot's own Ward account
JUKEBOX_WARD_PASSWORD=...                          # its password, only in .env
```

The account is made in Ward's console with one grant, `atrium` role
`jukebox`, which limits it to the Jukebox. Use a separate account for a local
dev bot (`discord-bot-dev` on the local Ward container): two processes must
never share one refresh token, or Ward revokes it.

**The deploy pushes `bots/discord/.env` to the server as it is**, so that file
holds the production values. For a local run against the local Ward and
atrium, give the four variables on the command line instead; they win over the
file:

```
JUKEBOX_ATRIUM_URL=http://localhost:5173/atrium-api \
JUKEBOX_WARD_URL=http://localhost:8792/ward-api \
JUKEBOX_WARD_USERNAME=discord-bot-dev JUKEBOX_WARD_PASSWORD=... \
npm run discord:jukebox-check
```

Check the setup without starting the bot:

```
npm run discord:jukebox-check
```

It signs in (or resumes the saved session), forces one refresh, and calls
atrium's `/health` (200) and `/library`, which must answer 403
`JUKEBOX_ROLE_FORBIDDEN`. Run it while the bot is stopped, since both use the
saved session. A refused password is tried once and not again until a restart,
because Ward locks an address out after five failed sign-ins in 15 minutes.

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
| `bots/discord/data/jukebox-session.json` | The Jukebox's Ward refresh token, so a restart resumes without a new sign-in. Delete it to force one |

Wiping a file resets that feature's state. RPG worlds can be hand-edited or
piped to an LLM directly; the data model is described in
[rpg/README.md](rpg/README.md).
