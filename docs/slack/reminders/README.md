# `/remindme` — personal reminders

## Surface

| Command | What it does |
| --- | --- |
| `/remindme <when> <text>` | Schedule a reminder. (`set` prefix is optional.) |
| `/remindme set <when> <text>` | Same, but explicit. |
| `/remindme list` | List your pending reminders. |
| `/remindme cancel <id>` | Cancel a reminder by its 8-char ID. |

When-spec accepts:

- Relative: `30m`, `2h`, `3d`
- Tomorrow: `tomorrow`, `tomorrow 9am`, `tomorrow 14:30`
- Absolute UTC: `2026-06-01 15:00`

If the first two tokens parse as a time (e.g. `tomorrow 9am`), the parser
consumes both; otherwise it consumes just the first token.

When fired, the bot posts `<@user> reminder: <text>` in the channel where the
reminder was scheduled.

## Storage

JSON at `bots/slack/data/reminders.json`. Each entry:

```json
{
  "id": "a1b2c3d4",
  "userId": "U…",
  "teamId": "T…",
  "channelId": "C…",
  "dueAt": "2026-06-01T15:00:00.000Z",
  "text": "grab coffee",
  "createdAt": "2026-05-22T10:00:00.000Z"
}
```

The store is in-memory cache + serialized write chain (single chain — the
file holds all teams' reminders).

## Delivery

A `setInterval` in `index.ts` polls the store every 30 seconds and posts any
due reminders via `chat.postMessage`. Fired reminders are deleted from the
store in the same pass — at-most-once delivery, accepting that a restart can
miss reminders due in the window between tick and next tick after boot. Good
enough for a hobby bot.

## Source

| What | Where |
| --- | --- |
| Time-spec parser | [`bots/slack/src/reminders/parse.ts`](../../../bots/slack/src/reminders/parse.ts) |
| Persistence | [`bots/slack/src/reminders/store.ts`](../../../bots/slack/src/reminders/store.ts) |
| Tick / delivery | [`bots/slack/src/reminders/tick.ts`](../../../bots/slack/src/reminders/tick.ts) |
| Slash command wiring | [`bots/slack/src/index.ts`](../../../bots/slack/src/index.ts) |

## Notes

- Slack renders the due-at timestamp with `<!date^…|fallback>` so each user
  sees it in their own locale and timezone.
- No birthday feature ported from Discord — punt until someone asks.
