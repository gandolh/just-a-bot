# Timezone Clock

A world clock for Discord servers. Each user registers their IANA timezone once and it travels with them globally — no matter which server they type `/clock show` in, their time shows up.

## Command surface

A single slash command, `/clock <sub>`:

| Subcommand                  | Effect                                                                              |
| --------------------------- | ----------------------------------------------------------------------------------- |
| `/clock set timezone:<tz>`  | Register your IANA timezone (e.g. `America/New_York`, `Europe/Bucharest`). Autocompletes as you type. |
| `/clock unset`              | Remove your registered timezone.                                                    |
| `/clock show`               | Display an embed listing all registered members in this server with their current local time, sorted west to east by UTC offset. |

## Quick start

```
Alice: /clock set timezone:America/New_York
Bob:   /clock set timezone:Europe/Bucharest
Alice: /clock show
  → 🕐 World Clock
      Alice (America/New_York)
      3:42 PM — UTC-04:00

      Bob (Europe/Bucharest)
      10:42 PM — UTC+03:00
```

## How it works

### Persistence

Timezones are stored in a single flat JSON file at `bots/discord/data/timezones.json` (gitignored), keyed by Discord user ID:

```json
{
  "123456789": "America/New_York",
  "987654321": "Europe/Bucharest"
}
```

The file is loaded once into memory on first access and kept in-process thereafter. Writes are serialised through a promise chain so concurrent updates don't corrupt the file.

### Time display

Each entry in `/clock show` displays two pieces of information:

1. Local time formatted with `Intl.DateTimeFormat` using `timeStyle: 'short'`.
2. UTC offset on the same line, e.g. `3:42 PM — UTC-04:00`.

The list is sorted by UTC offset (west-to-east), computed at display time so daylight-saving transitions are always reflected accurately.

### Autocomplete

The `timezone` option on `/clock set` provides live autocomplete. The full `Intl.supportedValuesOf('timeZone')` list (~600 entries) is filtered by the user's typed prefix, returning up to 25 matches (the Discord cap). Unknown timezone strings that bypass autocomplete are rejected ephemerally with a helpful error message.

### Guild scoping

`/clock show` fetches all members of the invoking guild in one `guild.members.fetch` call, then cross-references them against the global timezone store. Only users who are members of the current server appear in the embed. Users who have left the server are silently excluded.

## Source layout

| Concern             | Location                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------- |
| Persistence store   | [`bots/discord/src/clock/timezones.ts`](../../bots/discord/src/clock/timezones.ts)          |
| Slash command       | [`bots/discord/src/commands/clock.ts`](../../bots/discord/src/commands/clock.ts)            |
| Per-user state file | `bots/discord/data/timezones.json` (gitignored)                                             |

## Design notes

- **Global, not per-guild.** A user sets their timezone once and it follows them everywhere. This mirrors how wallets work and avoids the frustration of re-registering in every server.
- **No background timer.** All timezone offsets are computed inline at command invocation time. `Intl` handles DST transparently.
- **Single flat file.** Timezones are simple enough — one string per user — that a flat JSON store is the right call. No per-guild sharding needed.
- **Autocomplete over a free-text field.** ~600 IANA names is too many to memorise. Autocomplete makes discovery easy while still accepting any valid name.
