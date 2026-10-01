# Task 24 — `/birthday` and `/remindme`: reject dates that don't exist

## Context

Source: the second 2026-09-26 improvements pass, recorded in [log.md](../../log.md).
Rank 5 of the second pass.

Both date inputs accept days that aren't on the calendar, and neither says so.

- **`/birthday set`.** `parseDate` in `bots/discord/src/commands/birthday.ts:14-22`
  allows any day from 1 to 31 in any month. `/birthday set 04-31` replies
  "Birthday set to Apr 31" and never fires, because the daily check matches real
  UTC dates (`reminders/tick.ts:38`). The same goes for 02-30, 06-31, 09-31 and
  11-31, all easy typos.
- **`/remindme set when:YYYY-MM-DD`.** The ISO branch of `parseAbsolute` in
  `shared/src/reminders/parse.ts:33-37` passes the string to `new Date(...)`,
  and V8 rolls impossible days forward instead of rejecting them. Checked on
  2026-09-26 with Node 24: `2026-02-30` becomes March 2 and `2026-04-31` becomes
  May 1. Day 32 and up gives Invalid Date. The reminder is set and fires on the
  wrong day.

## Files you OWN

- `bots/discord/src/commands/birthday.ts`, `parseDate` only
- `shared/src/reminders/parse.ts`, the ISO branch only

## Files you must NOT touch

- The rest of the reminder and birthday flow. Absolute times staying in UTC is
  a documented v1 choice, and the peer audit parked it on Watch.
- Stored birthdays. If one is already impossible, name it in the log and leave
  it for the user.

## What to do

1. In `parseDate`, reject a day past the month's length. Use 29 for February,
   so a 02-29 birthday still saves. It fires only in leap years today, and that
   stays as is.
2. In the ISO branch, build the `Date`, then check that its UTC year, month and
   day equal the parsed ones. Return `null` if they don't, so the user gets the
   existing "Could not parse that time" reply (`commands/remindme.ts:49-51`).

## Acceptance

- `npm run typecheck` clean.
- A tsx scratch script shows `parseWhen('2026-02-30')` and
  `parseWhen('2026-04-31 10:00')` return `null`, while `parseWhen('2028-02-29')`
  and `parseWhen('2026-12-31 23:59')` return those dates.
- `/birthday set 04-31` is refused on the dev application, and `02-29` and
  `12-31` save.
- If brief 19 has landed, add these cases to its `parse.ts` tests instead of a
  scratch script.
