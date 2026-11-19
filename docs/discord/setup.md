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
not numeric where it should be. `WICKET_URL` and `WICKET_TOKEN` (for `/ask`, see
[ask](ask/README.md#config)) are optional.

## Gateway intents

The client asks for `Guilds`, `GuildMessages`, `MessageContent`,
`DirectMessages` and `GuildVoiceStates` (in
[`index.ts`](../../bots/discord/src/index.ts)). `MessageContent` is a
privileged intent: turn on **Message Content Intent** on the application's Bot
page in the Discord Developer Portal, or the gateway refuses the login. Wordle
and Hangman need it to read guesses from their threads. Mafia's night actions
arrive by DM, which needs `DirectMessages` and the `Channel` partial; the
Jukebox needs `GuildVoiceStates`.

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

The Jukebox converts each song with the `ffmpeg` binary, so a local run needs
`ffmpeg` on the `PATH`. The production image installs it.

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

Without a watcher (the pm2 path, see `ecosystem.config.cjs`):

```
npm run discord:start
```

Both run TypeScript directly through tsx — no build step. The production
container runs the same code without npm in front of it:

```
node --import tsx bots/discord/src/index.ts    # from the repo root
```

Keep the repo root as the working directory: the deploy registers commands
in the same image with `npm run discord:register`, which only the root
package.json has.

## Data directories

Runtime state lives under `bots/discord/data/`, except reminders and birthdays,
which live under `bots/data/`. Both are gitignored, and in production each is a
bind mount (`infrastructure/docker-compose.yml`). The full list of files is in
[architecture.md](architecture.md#data-paths).

Wiping a file resets that feature's state. RPG worlds can be hand-edited or
piped to an LLM directly; the data model is described in
[rpg/README.md](rpg/README.md).
