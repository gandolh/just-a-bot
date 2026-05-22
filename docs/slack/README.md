# Slack bot

A Slack workspace bot built on the same monorepo as the Discord bot. Started
from the WhatsApp-style bootstrap (`/ping`, `/help`, echo on mention) and now
hosts ports of several Discord features plus Slack-native additions.

## Feature index

- [Wordle](wordle/README.md) — `/wordle` thread-based 5-letter guessing game
- [Tic-Tac-Toe](tictactoe/README.md) — `/ttt` Block Kit button game (vs bot or vs user)
- [Reminders](reminders/README.md) — `/remindme` schedule personal pings
- [Timezone Clock](clock/README.md) — `/clock` register and show team timezones
- [Polls](polls/README.md) — `/poll` traditional button polls + yes/no reaction polls

Built-ins that don't get their own page: `/ping` (health), `/help` (lists
everything), `@bot <text>` (echoes in thread). They live in
[`../../bots/slack/src/handler.ts`](../../bots/slack/src/handler.ts).

## How it works

Built on [`@slack/bolt`](https://slack.dev/bolt-js/) in **Socket Mode** — the
bot opens an outbound WebSocket to Slack instead of receiving inbound webhooks,
so no public URL is needed for local dev.

Pure command routing for `/ping` and `/help` lives in
[src/handler.ts](../../bots/slack/src/handler.ts); everything else (slash
commands with state, button actions, message updates, reaction adds, the
reminder tick loop) is wired in [src/index.ts](../../bots/slack/src/index.ts).
Feature folders mirror the Discord layout — pure game logic in `game.ts`,
Slack-specific rendering and registry in `slack.ts`.

Workspace-scoped state (`team_id`) is used in place of Discord's `guild_id`
for the persistent stores.

## Source layout

```
bots/slack/src/
├── index.ts                 Bolt app bootstrap + all command/action wiring
├── env.ts                   zod-validated env (xoxb + xapp tokens)
├── handler.ts               pure router for /ping and /help
├── wordle/
│   ├── game.ts              5-letter game logic (pure)
│   ├── words.ts             word list
│   └── slack.ts             thread game registry + guess flow
├── tictactoe/
│   ├── game.ts              board + minimax bot (pure)
│   └── slack.ts             Block Kit button rendering + match registry
├── reminders/
│   ├── parse.ts             time-spec parser (durations + absolute)
│   ├── store.ts             JSON-backed reminder store (team-scoped)
│   └── tick.ts              periodic delivery via chat.postMessage
├── clock/
│   ├── store.ts             team→user→tz JSON store
│   └── format.ts            IANA validation + local-time / UTC-offset formatting
└── polls/
    └── slack.ts             traditional poll state + yes/no reaction helper
```

Persistent JSON lives in `bots/slack/data/` (auto-created on first write).

## Setup

1. Create a Slack app at <https://api.slack.com/apps>.
2. Enable **Socket Mode** and generate an **app-level token** (`xapp-…`) with
   the `connections:write` scope.
3. Under **OAuth & Permissions**, add bot scopes:
   - `chat:write` — send messages
   - `commands` — slash commands
   - `app_mentions:read` — receive @mentions (used for Wordle guesses + echo)
   - `reactions:write` — add :white_check_mark: / :x: to yes/no polls

   Install to your workspace; copy the bot token (`xoxb-…`).
4. Under **Slash Commands**, create each of: `/ping`, `/help`, `/wordle`,
   `/ttt`, `/remindme`, `/clock`, `/poll`. Request URL is ignored in Socket
   Mode — any placeholder works.
5. Under **Event Subscriptions**, enable events and subscribe the bot to
   `app_mention`.
6. Under **Interactivity & Shortcuts**, turn interactivity on (Block Kit
   buttons for `/ttt` and `/poll` need this; the request URL is ignored in
   Socket Mode).
7. Invite the bot to any channel where you want to use it (`/invite @bot`).
8. Put the tokens in `bots/slack/.env`:

   ```
   SLACK_BOT_TOKEN=xoxb-...
   SLACK_APP_TOKEN=xapp-...
   ```

9. From the repo root: `npm run slack:dev`.

## Design notes (cross-cutting)

- **Socket Mode over HTTP** — chosen so the hobby/dev workflow doesn't need
  ngrok or a public host. Switching to HTTP later is a one-line change in
  `index.ts` (drop `socketMode: true`, add a port).
- **In-memory state for games and live polls** — restart wipes active Wordle
  games, TTT matches, and button polls. Reminders and timezones are persisted
  because they have to survive restarts.
- **No autocomplete on slash commands** — Slack doesn't have Discord-style
  autocomplete; an `external_select` Block Kit picker could replace certain
  inputs (e.g. `/clock set`) later if needed.
- **Team-scoped persistence** — `team_id` (workspace) is used where Discord
  would use `guild_id`. Per-feature docs show the file shapes.
