# Birthdays + reminders

## Goal

Two small commands that share one tick loop. `/remindme` lets a user
schedule a ping ("remind me in 2h to take laundry out"). `/birthday set`
records a month-day and the bot wishes happy birthday in a chosen channel
once a year. Both survive a bot restart.

## Command surface

| Command | Effect |
| --- | --- |
| `/remindme when:<text> text:<text>` | Schedule a future ping. `when` accepts `30m`, `2h`, `3d`, `tomorrow 9am`, `2026-06-01 15:00`. Confirms with an ephemeral reply. |
| `/remindme list` | List the caller's pending reminders with IDs. |
| `/remindme cancel id:<id>` | Cancel a pending reminder by ID. |
| `/birthday set date:<MM-DD>` | Save the caller's birthday for this guild. |
| `/birthday list` | List all birthdays in this guild, sorted by date. |
| `/birthday remove` | Delete the caller's birthday in this guild. |

## Data model

Two separate flat-files (wallet pattern, [bots/discord/src/gambling/wallet.ts](../../bots/discord/src/gambling/wallet.ts)).

```ts
// data/reminders.json
type Reminder = {
  id: string;          // nanoid or `${userId}-${Date.now()}`
  userId: string;
  guildId: string;
  channelId: string;
  dueAt: string;       // ISO timestamp
  text: string;
  createdAt: string;
};
type RemindersState = Reminder[];

// data/birthdays.json
type Birthday = {
  userId: string;
  guildId: string;
  channelId: string;   // where to post the wish
  month: number;       // 1-12
  day: number;         // 1-31
  lastFiredYear: number | null;  // prevents double-firing in the same year
};
type BirthdaysState = Record<string, Birthday>;  // key = `${guildId}:${userId}`
```

Both files: in-memory cache + single promise-chain (wallet pattern).

## Interaction flow

### `/remindme`
1. Parse `when` with a small helper (`parseDuration` for `30m`/`2h`/`3d`,
   `parseAbsolute` for `YYYY-MM-DD HH:mm` and `tomorrow 9am`).
2. Push to `data/reminders.json`. Reply ephemerally with the ID + due time.
3. Tick loop (below) checks every minute. On due, posts
   `<@userId> reminder: <text>` in the original channel, deletes the entry.

### `/birthday`
1. `set` upserts the entry. `lastFiredYear = null` so it fires this year if
   the date hasn't passed; otherwise next year.
2. Tick loop (below) checks once per minute. If it's anyone's birthday in
   their guild's local timezone (we'll use UTC for v1; document as a v2
   improvement) AND `lastFiredYear !== currentYear`, post
   `🎂 Happy birthday <@userId>!` in the saved channel, set `lastFiredYear`.

### Shared tick loop

A single `setInterval(60_000)` started in [bots/discord/src/index.ts](../../bots/discord/src/index.ts)
right after `client.login`. The interval calls `tickReminders(client)` and
`tickBirthdays(client)`. Both functions need the Discord `Client` to look
up channels (`client.channels.fetch(channelId)`).

This is the **one** background timer in the bot (architecture.md notes
that lazy ticking is preferred, but date-based fires fundamentally need a
heartbeat). Document the trade-off in the design notes section.

## Files to add / modify

**New:**
- `bots/discord/src/reminders/store.ts` — load/save/list/add/remove reminders.
- `bots/discord/src/reminders/birthdays.ts` — same for birthdays.
- `bots/discord/src/reminders/tick.ts` — `tickReminders` + `tickBirthdays`.
- `bots/discord/src/reminders/parse.ts` — `parseDuration`, `parseAbsolute`.
- `bots/discord/src/commands/remindme.ts`
- `bots/discord/src/commands/birthday.ts`

**Modified:**
- `bots/discord/src/commands/index.ts` — register both commands.
- `bots/discord/src/index.ts` — `setInterval(() => { tickReminders(client); tickBirthdays(client); }, 60_000)` after `client.login`.

## Open questions / non-goals

- **Timezones**: v1 stores `MM-DD` and fires on UTC midnight. Per-user
  timezone setting is a v2 add.
- **Recurring reminders** (`/remindme every monday`): v2.
- **Reminder edits**: v1 = cancel + recreate. No edit command.
- **Nanoid dep**: prefer `crypto.randomUUID().slice(0, 8)` to avoid a new dep.

## Done

Delete this file. Create `docs/reminders/README.md` (or split into
`docs/reminders/` + `docs/birthdays/` if you'd rather — but they share the
tick loop so one doc is cleaner). Add to `docs/README.md` index.
