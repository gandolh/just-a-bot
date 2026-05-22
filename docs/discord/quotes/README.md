# Quote Book

Save memorable messages from your server and recall them later. Each guild keeps
its own book. Right-click any message to save it instantly, or supply a message
link with `/quote add`.

## Command surface

| Command | Effect |
| --- | --- |
| `/quote add link:<message-link>` | Fetch and save the linked message. |
| `/quote random` | Post a random quote from this server. |
| `/quote search text:<query>` | Post the most recent quote containing `query`. |
| `/quote by user:<@user>` | Random quote from that author. |
| `/quote list` | Paginated list (10 per page, Prev/Next buttons). |
| `/quote remove id:<id>` | Remove by ID. Only the saver or a guild admin (Manage Messages). |
| **Context menu: "Save Quote"** | Right-click any message → Apps → Save Quote. |

## How it works

### Saving a quote

`/quote add` parses the Discord message link (format: `https://discord.com/channels/<guild>/<channel>/<message>`),
validates it belongs to the current guild, fetches the message via the Discord API,
and appends it to the guild's quote book. The context menu "Save Quote" skips the
fetch — `interaction.targetMessage` is already resolved.

Each quote gets an 8-character UUID fragment as its ID (e.g. `a1b2c3d4`).

### Retrieving quotes

- `/quote random` — uniform random pick across all quotes.
- `/quote by` — filters to one author, then picks randomly.
- `/quote search` — scans from newest to oldest, returns the first match containing the query string (case-insensitive).

Quotes are rendered as embeds: description = message content, footer = author tag + saver mention + ID, timestamp = when saved. If any attachment is an image, it is set as the embed image.

### Pagination

`/quote list` renders 10 quotes per page with Prev/Next buttons. Button custom IDs
are `quote:list:<page>` (0-indexed). The router in `index.ts` dispatches on the
`quote:list:` prefix.

### Removal

`/quote remove id:<id>` checks that the caller either saved the quote themselves or
holds the `ManageMessages` permission before deleting.

## Source layout

| Concern | Location |
| --- | --- |
| Quote storage + persistence | [`bots/discord/src/quotes/store.ts`](../../../bots/discord/src/quotes/store.ts) |
| Slash command + context menu | [`bots/discord/src/commands/quote.ts`](../../../bots/discord/src/commands/quote.ts) |
| Per-guild state file | `bots/discord/data/quotes/<guild-id>.json` (gitignored) |

## Design notes

- **Per-guild JSON, append-only.** Same trade as RPG and D&D — human-readable, LLM-ingestible, no migration headaches. Quotes are never edited; remove + re-add if you need to fix one.
- **No cross-guild sharing.** The file layout enforces guild isolation at the filesystem level.
- **Context menu as a sibling command.** `ContextMenuCommandBuilder` lives alongside `SlashCommandBuilder` in the command registry (`commands/index.ts`) via a separate `ContextMenuCommand` interface. Both are serialised to JSON and pushed to Discord in `register.ts`.
- **Lazy fetch in `/quote add`.** The bot fetches the message only when the command is run, not on save. If the message is later deleted, the saved content is preserved.
