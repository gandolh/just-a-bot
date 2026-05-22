# Leaderboards

A single `/top <category>` command that shows the top 10 players in the guild across the bot's various scores. Read-only over existing stores — no new persistence.

## Command surface

| Command | Effect |
| --- | --- |
| `/top category:<choice>` | Show top 10 for the chosen category as an embed. |

Choices:

| Value | Description |
| --- | --- |
| `coins` | Gambling wallet balance (global, not guild-scoped). |
| `rpg-xp` | XP from the RPG world for this guild. |
| `rpg-kills` | Mob kill count from the RPG world for this guild. |
| `rpg-coins` | RPG character coins for this guild (separate from wallet). |

## How it works

1. User runs `/top category:rpg-xp`.
2. `getLeaderboard` in `leaderboard/queries.ts` reads the appropriate store — the gambling wallet or the RPG world file for this guild.
3. Entries are sorted descending and sliced to 10.
4. Display names are resolved via a single batched `guild.members.fetch` call; entries whose user has left the guild fall back to the character name (RPG) or "Unknown user" (wallet).
5. An `EmbedBuilder` with a numbered list and a footer timestamp is returned.

The `coins` category is global (the wallet stores balances without guild dimension) and the embed footer notes this.

## Source layout

| Concern | Location |
| --- | --- |
| Pure query functions | [`bots/discord/src/leaderboard/queries.ts`](../../../bots/discord/src/leaderboard/queries.ts) |
| Slash command + embed | [`bots/discord/src/commands/top.ts`](../../../bots/discord/src/commands/top.ts) |
| Wallet store (read) | [`bots/discord/src/gambling/wallet.ts`](../../../bots/discord/src/gambling/wallet.ts) |
| RPG world store (read) | [`bots/discord/src/rpg/world.ts`](../../../bots/discord/src/rpg/world.ts) |

## Design notes

- **Query at read-time, not a denormalized table.** The existing stores are small enough that sorting in-memory on each request is trivially fast. Maintaining a separate leaderboard table would add write-time coupling to every game action for no real benefit at this scale.
- **Coins leaderboard is global, not guild-scoped.** The wallet has no guild dimension — it is a flat `Record<userId, number>`. Guild-scoping would require fetching all member IDs first and filtering; the added complexity is not worth it for v1. A footer note tells users it is a global ranking.
- **No new persistence.** All data is read from `wallets.json` and the per-guild `rpg/<guildId>.json`. Nothing is written by `/top`.
