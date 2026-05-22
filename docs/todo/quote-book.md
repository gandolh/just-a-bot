# Quote book

## Goal

Save memorable messages from your server, recall them later. Right-click a
message → "Save Quote" or `/quote add <link>`. `/quote random` pulls one
out for nostalgia. Each guild has its own book.

## Command surface

| Command | Effect |
| --- | --- |
| `/quote add link:<message-link>` | Save the linked message. |
| `/quote random` | Post a random quote from this guild. |
| `/quote search text:<query>` | Post the most recent quote containing `query`. |
| `/quote by user:<@user>` | Random quote from that author. |
| `/quote list` | Paginated list (10 per page, buttons). |
| `/quote remove id:<id>` | Remove by ID. Only the saver or a guild admin. |
| **Context menu: "Save Quote"** | Right-click on any message → save it. |

## Data model

Per-guild JSON (RPG pattern, [bots/discord/src/rpg/world.ts:146-196](../../bots/discord/src/rpg/world.ts)).
File: `bots/discord/data/quotes/<guildId>.json`.

```ts
type Quote = {
  id: string;            // crypto.randomUUID().slice(0, 8)
  guildId: string;
  authorId: string;      // who said it
  authorTag: string;     // captured for display even if user leaves
  content: string;
  channelId: string;
  messageId: string;
  attachments: string[]; // URLs from message.attachments
  savedBy: string;       // who ran /quote add
  savedAt: string;       // ISO
};
type QuoteBook = {
  guildId: string;
  quotes: Quote[];       // append-only, oldest first
};
```

In-memory `Map<guildId, QuoteBook>` + `Map<guildId, Promise<void>>` write
chains, same shape as `rpg/world.ts`.

## Interaction flow

### `/quote add link:<link>`
1. Parse the link with `MessageURLRegex` (discord.js exports it). Extract
   `guildId`, `channelId`, `messageId`.
2. Reject if `guildId !== interaction.guildId`.
3. `await channel.messages.fetch(messageId)` — capture content,
   author.tag, attachments.
4. Append to the book, persist, reply ephemerally with the new ID.

### Context menu "Save Quote"
1. `new ContextMenuCommandBuilder().setName('Save Quote').setType(ApplicationCommandType.Message)`.
2. `interaction.targetMessage` is already the resolved message — no fetch
   needed. Same store + persist as above.
3. Reply ephemerally with the ID.
4. Add to the same command registry; `register.ts` works as-is because
   the builder's `.toJSON()` is also a slash-command body.

### `/quote random`
1. Load book, `Math.random` an index. Render as an embed:
   - Description = content
   - Footer = "— <authorTag> · saved by <saverTag>"
   - Timestamp = quote.savedAt
   - If `attachments[0]` is an image URL, set as `image`.

### `/quote remove`
- Only allow if `interaction.user.id === quote.savedBy` OR
  `interaction.memberPermissions.has(PermissionsBitField.Flags.ManageMessages)`.

## Files to add / modify

**New:**
- `bots/discord/src/quotes/store.ts` — load/save/append/remove, mirroring `rpg/world.ts`.
- `bots/discord/src/commands/quote.ts` — slash + context-menu commands.

**Modified:**
- `bots/discord/src/commands/index.ts` — register `/quote` and the
  "Save Quote" context-menu command. Note: the `Command` interface in
  [bots/discord/src/commands/types.ts](../../bots/discord/src/commands/types.ts)
  only allows `SlashCommandBuilder` variants; widen its `data` union to
  also accept `ContextMenuCommandBuilder`. The
  `MessageContextMenuCommandInteraction` is a different interaction
  subtype — route it in `index.ts` via `interaction.isMessageContextMenuCommand()`.

## Open questions / non-goals

- **Editing quotes**: no. Quotes are a historical record. Remove + re-add.
- **Cross-guild quotes**: no. Quotes are guild-scoped (the per-guild file
  layout enforces this).
- **Pinned quotes / quote of the day**: v2.
- **Render with `/img`**: once `/img` ships, `/quote random` can optionally
  return a styled card image. Cross-linked in the `/img` TODO.

## Done

Delete this file. Create `docs/quotes/README.md`. Add to `docs/README.md`.
