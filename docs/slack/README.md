# Slack

## Goal

A Slack workspace bot built on the same monorepo as the Discord bot. Initial
surface mirrors the WhatsApp bootstrap: `/ping`, `/help`, and an echo on app
mention. Game/community features can be ported incrementally from the Discord
bot.

## Command surface

| Command | What it does |
| --- | --- |
| `/ping` | Replies `pong` ephemerally. |
| `/help` | Lists available commands ephemerally. |
| `@bot <text>` | Bot echoes the text in the same thread. |

## How it works

Built on [`@slack/bolt`](https://slack.dev/bolt-js/) in **Socket Mode** — the
bot opens an outbound WebSocket to Slack instead of receiving inbound webhooks,
so no public URL or reverse proxy is required for local dev.

The router in [src/handler.ts](../../bots/slack/src/handler.ts) is a pure
function returning text; Slack-specific glue (acking, replying, threading)
lives in [src/index.ts](../../bots/slack/src/index.ts). This split mirrors the
Discord convention of keeping platform-specific code out of game logic.

## Source layout

```
bots/slack/src/
├── index.ts     Bolt app bootstrap + slash/event wiring
├── env.ts       zod-validated env (xoxb + xapp tokens)
└── handler.ts   pure command router
```

## Setup

1. Create a Slack app at <https://api.slack.com/apps>.
2. Enable **Socket Mode** and generate an **app-level token** (`xapp-…`) with
   the `connections:write` scope.
3. Under **OAuth & Permissions**, add bot scopes: `chat:write`, `commands`,
   `app_mentions:read`. Install to your workspace; copy the bot token (`xoxb-…`).
4. Under **Slash Commands**, create `/ping` and `/help` (request URL is ignored
   in Socket Mode — any placeholder works).
5. Under **Event Subscriptions**, enable events and subscribe the bot to
   `app_mention`.
6. Put the tokens in `bots/slack/.env`:

   ```
   SLACK_BOT_TOKEN=xoxb-...
   SLACK_APP_TOKEN=xapp-...
   ```

7. From the repo root: `npm run slack:dev`.

## Design notes

- **Socket Mode over HTTP** — chosen so the hobby/dev workflow doesn't need
  ngrok or a public host. Switching to HTTP later is a one-line change in
  `index.ts` (drop `socketMode: true`, add a port).
- **No persistence yet** — the Slack bot has no `data/` directory. Adding
  per-workspace JSON stores would follow the same pattern as `bots/discord/data/`
  if/when features that need state get ported.
- **Game features deferred** — Slack's Block Kit can render buttons and modals,
  but the layout language is different from Discord's components. Ports of
  things like `/trivia` or `/c4` would need a Block Kit rewrite of the render
  layer.
