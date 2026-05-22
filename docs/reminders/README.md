# Reminders & Birthdays

Two small commands — `/remindme` and `/birthday` — backed by a shared once-per-minute tick loop. Both survive bot restarts: state is JSON on disk.

## Goal

`/remindme` lets any user schedule a future ping in the current channel. `/birthday` records a user's birth date (MM-DD) per guild and posts a birthday wish every year on that date.

## Command surface

### `/remindme`

| Subcommand | Effect |
| --- | --- |
| `/remindme set when:<time> text:<text>` | Schedule a reminder. `when` accepts `30m`, `2h`, `3d`, `tomorrow 9am`, `2026-06-01 15:00`. Replies ephemerally with the ID + relative due time. |
| `/remindme list` | List the caller's pending reminders with IDs and relative fire times. |
| `/remindme cancel id:<id>` | Cancel a pending reminder by ID. |

### `/birthday`

| Subcommand | Effect |
| --- | --- |
| `/birthday set date:<MM-DD>` | Save the caller's birthday for this guild. The bot will post a wish in the channel where `set` was called. |
| `/birthday list` | List all birthdays in this guild, sorted by date. |
| `/birthday remove` | Delete the caller's birthday from this guild. |

## How it works

### Reminder flow

1. `/remindme set` parses `when` via `parseDuration` (relative: `30m`/`2h`/`3d`) or `parseAbsolute` (absolute: `YYYY-MM-DD HH:mm` and `tomorrow [time]`).
2. A `Reminder` record (id, userId, guildId, channelId, dueAt, text, createdAt) is appended to `data/reminders.json`.
3. The tick loop (see below) checks every minute. When a reminder is due, the bot sends `<@userId> reminder: <text>` to the original channel and removes the record.

### Birthday flow

1. `/birthday set` upserts a `Birthday` record (userId, guildId, channelId, month, day, lastFiredYear=null) in `data/birthdays.json`.
2. The tick loop checks every minute (UTC). When the current month+day matches a birthday AND `lastFiredYear !== currentYear`, the bot posts `🎂 Happy birthday <@userId>!` in the saved channel and sets `lastFiredYear = currentYear`.

### Shared tick loop

A single `setInterval(60_000)` is started in `bots/discord/src/index.ts` immediately after `client.login`. Each interval fires `tickReminders(client)` and `tickBirthdays(client)` in parallel (errors are caught and logged separately).

This is the only background timer in the bot. Date-based fires require a heartbeat; there's no lazy-tick alternative the way world ticks work for the RPG.

## Source layout

| Concern | Location |
| --- | --- |
| Reminder store (load/save/query) | [`bots/discord/src/reminders/store.ts`](../../bots/discord/src/reminders/store.ts) |
| Birthday store (load/save/query) | [`bots/discord/src/reminders/birthdays.ts`](../../bots/discord/src/reminders/birthdays.ts) |
| Tick handlers | [`bots/discord/src/reminders/tick.ts`](../../bots/discord/src/reminders/tick.ts) |
| Time parsing helpers | [`bots/discord/src/reminders/parse.ts`](../../bots/discord/src/reminders/parse.ts) |
| `/remindme` slash command | [`bots/discord/src/commands/remindme.ts`](../../bots/discord/src/commands/remindme.ts) |
| `/birthday` slash command | [`bots/discord/src/commands/birthday.ts`](../../bots/discord/src/commands/birthday.ts) |
| Reminder state file | `bots/discord/data/reminders.json` (gitignored) |
| Birthday state file | `bots/discord/data/birthdays.json` (gitignored) |

## Design notes

- **Single tick loop, not two.** Both reminder and birthday checks share one `setInterval`. This keeps exactly one timer in the process, makes it easy to find, and avoids drift if the intervals were separate.
- **Heartbeat vs. lazy tick.** The RPG world uses no background timer (mobs only move when a player acts). Reminders and birthdays fundamentally cannot be lazy — they need to fire at a wall-clock time even when no command is issued. The trade-off is documented here rather than hidden.
- **UTC for birthdays (v1).** Birthday matching is done against UTC midnight. Per-user timezone offsets are a v2 add — the field `channelId` already captures where to post, so adding a `timezone` field to `Birthday` later is a clean migration.
- **`crypto.randomUUID().slice(0, 8)` for IDs.** No new dependency; the 8-char hex prefix is short enough for users to type in `/remindme cancel id:…` and statistically collision-free for a typical guild's reminder volume.
- **Same wallet pattern.** In-memory cache + single promise-chain for writes, matching `gambling/wallet.ts` and `rpg/world.ts`. No SQLite, JSON stays human-readable.
