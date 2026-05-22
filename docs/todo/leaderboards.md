# Leaderboards

## Goal

A single `/top <category>` command that shows the top 10 players in this
guild across the bot's various scores. Read-only over existing stores —
no new persistence in v1.

## Command surface

| Command | Effect |
| --- | --- |
| `/top category:<choice>` | Show top 10 for the chosen category. |

Choices (use `addChoices` on the slash option):
- `coins` — wallet balance (from `data/wallets.json`).
- `rpg-xp` — XP from `data/rpg/<guildId>.json`.
- `rpg-kills` — mob kills from the same file.
- `rpg-coins` — RPG character coins (separate from wallet — see
  [docs/rpg/README.md](../rpg/README.md) design notes).
- *(future)* `wordle`, `blackjack` — see open questions.

## Data model

**No new files.** Reads existing stores:
- `bots/discord/src/gambling/wallet.ts:getBalance` / direct read of the
  `Record<userId, number>` map.
- `bots/discord/src/rpg/world.ts:loadWorld` → `world.chars` keyed by userId.

For `coins`, the wallet is global (single file, no guild dimension). To
make `/top coins` guild-scoped, filter to userIds whose Discord user is a
member of the current guild via `interaction.guild.members.fetch({ user: [...] })`
or just show global coins and label it as such. **v1 = global with a
footer note**, simpler.

## Interaction flow

1. `/top category:rpg-xp` → load world, build `Array<{userId, score}>`,
   sort descending, take top 10.
2. Resolve display names: `interaction.guild.members.fetch({ user: ids })`
   (one batched request). Fall back to "Unknown user" if a member left.
3. Render as an `EmbedBuilder` with:
   - Title: "🏆 Top by <category>"
   - Description: numbered list
     ```
     1. **Astrid** — 1,240 XP
     2. **Bob**    — 980 XP
     ...
     ```
   - Footer: timestamp, "global" tag if applicable.

Reference implementation: `/rpg top` already does this for XP — see
[bots/discord/src/commands/rpg.ts](../../bots/discord/src/commands/rpg.ts).
Copy that shape; generalize over a `keyFn: (char) => number`.

## Files to add / modify

**New:**
- `bots/discord/src/commands/top.ts` — slash handler + per-category
  resolvers.
- *(optional)* `bots/discord/src/leaderboard/queries.ts` — pure functions
  that take the raw stores and return `Array<{userId, score, label?}>`.
  Pure, testable, and reusable by the `/img` leaderboard template later.

**Modified:**
- `bots/discord/src/commands/index.ts` — register `/top`.

## Open questions / non-goals

- **Wordle / blackjack categories**: those games don't currently persist
  stats. To support them you'd need a `data/stats.json` (per-user counts)
  written from inside the wordle + blackjack flows. Drop from scope or
  add as a separate TODO — recommended: drop from v1, add a follow-up
  `game-stats.md` TODO if you want them.
- **Pagination beyond top 10**: v2.
- **Image rendering**: once `/img` ships, add `/top image:true` to render
  the leaderboard as a styled PNG. Cross-link from `img-html-to-png.md`.
- **Time windows** (top this week / month): v2. Would need timestamped
  events, which the current stores don't keep.

## Done

Delete this file. Create `docs/leaderboards/README.md` describing the
command, the data sources it reads, and the design choice to query at
read-time rather than maintain a denormalized leaderboard table.
