# Task 09 — `/clock` prints the host's UTC offset for every zone

## Context

Source: the 2026-09-26 improvements audit, recorded in [log.md](../../log.md).
Rank 6 of 16.

`formatLocalTime` in `bots/discord/src/commands/clock.ts:12-36` formats the target
zone's wall clock as a string, parses it with `new Date("YYYY-MM-DDTHH:MM:SS")`
(which reads it as host-local time), and calls `.getTimezoneOffset()`. That
returns the host's offset, not the target zone's.

The audit reproduced this. With `TZ=UTC`, America/New_York, Asia/Tokyo and
Europe/Bucharest all print `UTC+00:00`. With `TZ=Europe/Bucharest`, all three print
`UTC+03:00`. The time itself is right. Only the offset label is wrong, and it's
wrong for everyone outside the host's zone. A typical VPS and the
`node:24-alpine` image both run in UTC, so production shows `+00:00` for every
user.

`getUtcOffsetMinutes` (`:38-49`) in the same file computes the offset correctly,
because the host-local parse cancels out in its subtraction. It's already used
for sorting at `:131` and `:148`.

## Files you OWN

- `bots/discord/src/commands/clock.ts`

## What to do

1. In `formatLocalTime`, replace the offset block (`:19-28`) with
   `const offsetMin = getUtcOffsetMinutes(tz);`. Function declarations are
   hoisted, so the order in the file doesn't matter. Keep the formatting at
   `:30-35`.

## Acceptance

- `npm run typecheck` clean.
- On the dev application under `TZ=UTC npm run discord:dev`, with zones set via
  `/clock`, `/clock show` prints:
  - Asia/Tokyo as `UTC+09:00`
  - Asia/Kolkata as `UTC+05:30`
  - America/New_York as `UTC-04:00` while US daylight time is on, `UTC-05:00`
    otherwise
- The same offsets appear under `TZ=Europe/Bucharest`.
- If brief 19 has landed, export `formatLocalTime` and assert these offsets in a
  test instead.
