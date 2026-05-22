# Confession Box

A privacy-first anonymous confession feature. Each Discord server gets its own
configured target channel. Users submit confessions with no public trace; the
bot posts them as styled embeds under its own name.

## Command surface

A single slash command, `/confess <sub>`:

| Subcommand                          | Who      | Effect                                                                 |
| ----------------------------------- | -------- | ---------------------------------------------------------------------- |
| `/confess set-channel #channel`     | Admin    | Configure the channel where confessions are posted. Requires **Manage Server**. |
| `/confess submit text:<string>`     | Anyone   | Submit an anonymous confession (max 1000 chars).                       |

## Quick start

```
Admin:  /confess set-channel #confessions
Alice:  /confess submit text:I put the empty milk carton back in the fridge
Bot → #confessions: embed "Anonymous Confession #1 — I put the empty milk carton..."
Alice sees ephemeral: "Posted. ID: #1"
```

## Privacy contract

- The submitter's user ID is **never** written to disk, never included in any
  embed, and never logged.
- The only place a user ID appears is in the in-memory cooldown `Map` (keyed
  `<guildId>:<userId>`). This map is cleared on every bot restart.
- The ephemeral confirmation is only visible to the submitter.

## Anti-spam

A 60-second per-user cooldown (in-memory only, not persisted) prevents rapid
re-submission. The user sees how many seconds remain if they try too early.

## Persistence

`bots/discord/data/confessions/<guild-id>.json` (gitignored):

```json
{
  "channelId": "1234567890",
  "nextId": 5,
  "confessions": [
    { "id": 1, "text": "...", "postedAt": "2026-01-01T00:00:00.000Z" },
    ...
  ]
}
```

Field | Type | Notes
----- | ---- | -----
`channelId` | `string \| null` | Target channel; `null` until an admin runs `set-channel`
`nextId` | `number` | Auto-increments with every accepted confession
`confessions` | array | Permanent log of text + timestamp. No user IDs.

## Source layout

| Concern              | Location                                                                               |
| -------------------- | -------------------------------------------------------------------------------------- |
| Persistence + cache  | [`bots/discord/src/confessions/store.ts`](../../../bots/discord/src/confessions/store.ts) |
| Slash command        | [`bots/discord/src/commands/confess.ts`](../../../bots/discord/src/commands/confess.ts)   |
| Per-guild state file | `bots/discord/data/confessions/<guild-id>.json` (gitignored)                          |

## Design notes

- **No user IDs on disk.** The privacy promise is enforced at the store layer —
  `addConfession` never accepts a user ID parameter, so accidental leakage is
  structurally impossible.
- **In-memory cooldown.** A restart resets all cooldowns. Acceptable trade-off:
  no extra disk I/O, no stale per-user timestamps accumulating in JSON.
- **Length capped at 1000 chars.** Discord embed descriptions are capped at
  4096 chars, but 1000 keeps embeds readable and discourages walls of text.
- **One file per guild, JSON, human-readable.** Same trade as the rest of the
  project — readability over transactional correctness.
- **Admin gate via `ManageGuild`.** Consistent with Discord conventions for
  server-level configuration commands.
