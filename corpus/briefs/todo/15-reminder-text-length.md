# Task 15 — Reminders: cap text length so long reminders aren't dropped and `/remindme list` keeps working

## Context

Source: the 2026-09-26 improvements audit, recorded in [log.md](../../log.md).
Rank 12 of 16.

The `text` option at `bots/discord/src/commands/remindme.ts:17` has no
`setMaxLength`, and Discord allows up to 6000 characters in a string option.
Nothing downstream trims it.

- **A long reminder is silently deleted.** Take
  `/remindme set when:1h text:<a 1,990-character note>`. When it fires,
  `reminders/tick.ts:18-20` sends `<@id> reminder: <text>`. That's over Discord's
  2000-character message limit, so the send throws. The catch at `tick.ts:23-26`
  logs the error and still adds the id to `fired`, so the reminder is deleted
  without ever being delivered.
- **The list breaks.** `handleList` (`remindme.ts:79-88`) joins every reminder's
  full text into one message. A single long reminder, or about ten of 200
  characters each, pushes that past 2000 characters. The reply throws,
  `index.ts` answers "Something went wrong", and the user can no longer see the
  reminder IDs they'd need to cancel anything.

## Files you OWN

- `bots/discord/src/commands/remindme.ts`
- `bots/discord/src/reminders/tick.ts`

## Files you must NOT touch

- `shared/src/reminders/*`
- Birthdays

## What to do

1. Add `.setMaxLength(1000)` to the `text` option. This changes the command
   schema, so run `npm run discord:register` against the dev application. Note in
   the log entry that production needs the same step after deploy.
2. In `tick.ts`, truncate at send time so the whole message stays under 2000
   characters. Reminders stored before the cap can already be longer than that.
3. In `handleList`:
   - show at most about 80 characters of each text, ending with an ellipsis
   - stop adding lines before the total passes about 1900 characters
   - when you cut the list short, append "…and N more"

## Acceptance

- `npm run typecheck` clean, and the commands are registered on the dev app.
- Discord's client rejects `/remindme set` with more than 1000 characters.
- Hand-edit a 1,990-character reminder into the dev copy of
  `bots/data/reminders.json`. It's delivered truncated instead of dropped.
- With 15 reminders of 200 characters each, `/remindme list` replies with the
  capped list.
