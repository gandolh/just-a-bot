# RPG

A lightweight multiplayer chat RPG. Each Discord server gets one shared
persistent world: players drop in with `/rpg join`, walk an emoji grid,
fight mobs that spawn and hunt them, collect loot, and level up. No DM,
no turn order, no character sheets to fill out.

Replaces the earlier D&D layer (DM-authored campaign + initiative-based
combat). The trade: less depth per session, but anyone can interact in
30 seconds and feel like something happened.

## Command surface

A single slash command, `/rpg <sub>`:

| Subcommand          | Effect                                                                |
| ------------------- | --------------------------------------------------------------------- |
| `/rpg join`         | Create your character (name + glyph optional). Spawns at the plaza.   |
| `/rpg me`           | Sheet: HP, ATK/DEF, level, XP, coins, kills/deaths, cooldown, inventory. |
| `/rpg move <dir>`   | One step (n/s/e/w/ne/nw/se/sw). Auto-picks up loot on the tile.       |
| `/rpg look`         | List entities within 7 cells.                                         |
| `/rpg attack`       | Strike the nearest adjacent mob. 3-second cooldown. Mob counter-attacks. |
| `/rpg pickup`       | Manually grab loot on your current tile (move auto-collects too).     |
| `/rpg use`          | Drink a healing potion (`+12 HP`) if you have one.                    |
| `/rpg map`          | Emoji viewport centred on you (or the plaza if you haven't joined).   |
| `/rpg top`          | Leaderboard by XP.                                                    |
| `/rpg leave`        | Delete your character.                                                |
| `/rpg duel @user`   | Challenge another player to a 1v1 arena duel. Accept/Decline buttons. |
| `/rpg trade @user`  | Open a trade proposal with another player. Item selectors + coin adjustments. |

## Quick start

```
Alice: /rpg join name:Astrid glyph:🧝
Alice: /rpg map           ← see the plaza
Alice: /rpg move e
Alice: /rpg look          ← spots a goblin 4 cells away
Alice: /rpg move e        ← step closer
Alice: /rpg attack        ← swing; goblin counter-attacks
Alice: /rpg attack        ← (after cooldown) finish it; +12 XP, +3 coins
```

## How it works

### World

Procedural per-guild map (default 60×40), seeded by guild ID so the
layout is stable across restarts. Edges are walls, interior is ground +
forest + water + mountain + scattered walls, with a 5×5 plaza carved at
the centre as the spawn point.

| Token | Meaning  | Render | Walkable |
| :---: | -------- | :----: | :------: |
| `.`   | Ground   | 🟫     | yes      |
| `=`   | Plaza    | 🟧     | yes      |
| `f`   | Forest   | 🌲     | yes      |
| `~`   | Water    | 🟦     | no       |
| `^`   | Mountain | ⛰️     | no       |
| `#`   | Wall     | ⬛     | no       |

### Characters

Three numbers + a glyph. No abilities, no classes, no equipment slots.

| Field      | Starting value | On level-up         |
| ---------- | -------------- | ------------------- |
| `hp/maxHp` | 20             | `+4 maxHp`, full heal |
| `atk`      | 3              | `+1`                |
| `def`      | 1              | `+1`                |
| `coins`    | 10             | —                   |

Levels cost 50 XP each (L1 → L2 at 50, L2 → L3 at 100, …).

### Mobs

Six handmade kinds with fixed stats:

| Mob    | HP | ATK | DEF | XP  | Coins | Loot                                  |
| ------ | -- | --- | --- | --- | ----- | ------------------------------------- |
| Slime  | 8  | 2   | 0   | 5   | 0–2   | slime-jelly (30%)                     |
| Goblin | 14 | 4   | 1   | 12  | 1–5   | rusty-dagger (20%), healing-potion (15%) |
| Wolf   | 18 | 5   | 1   | 18  | 0–3   | wolf-pelt (40%)                       |
| Bandit | 22 | 6   | 2   | 25  | 3–12  | healing-potion (25%), leather-armor (10%) |
| Orc    | 32 | 8   | 3   | 40  | 4–15  | iron-sword (15%), healing-potion (30%) |
| Troll  | 60 | 12  | 4   | 100 | 10–40 | troll-tooth (60%), greatsword (10%)   |

Spawn weight biases toward mobs whose XP tier matches the highest
player's level, so newcomers see slimes and goblins and high-level
players see orcs and trolls.

### Combat math

A swing is a d20 hit check followed by a damage roll. Used for both
players and mobs.

```
hit:    d20 + attacker.atk  vs  10 + defender.def
        natural 1  → always miss
        natural 20 → always hit, damage doubled
damage: 1d6 + attacker.atk
```

Players have a 3-second cooldown between swings. Mobs swing once per
`speedMs` (2.5–5s depending on kind).

When a mob dies: drops loot on the tile, coins go straight to the
killer's wallet, killer gets XP, may level up (full heal). When a
character dies: respawns at the plaza with full HP, drops half their
coins as a loot tile.

### Tick

There is **no background timer**. Every command calls `tickWorld(w)`
before doing anything else. The tick:

1. Spawns new mobs if the per-guild cap isn't met (cap scales with
   player count and map area, min 6).
2. For each mob whose `lastStepAt` is older than `speedMs`, either
   attacks an adjacent player, steps toward the nearest player in
   aggro range, or wanders.

Lazy ticking means a dead server with zero `/rpg` traffic costs zero CPU,
and there's no `setInterval` machinery to coordinate across guilds.
Tradeoff: mobs don't move when no one's playing — which is fine.

## Source layout

| Concern              | Location                                                              |
| -------------------- | --------------------------------------------------------------------- |
| World + persistence  | [`bots/discord/src/rpg/world.ts`](../../bots/discord/src/rpg/world.ts) |
| Combat resolution    | [`bots/discord/src/rpg/combat.ts`](../../bots/discord/src/rpg/combat.ts) |
| Mob spawn + AI tick  | [`bots/discord/src/rpg/tick.ts`](../../bots/discord/src/rpg/tick.ts)    |
| Map rendering        | [`bots/discord/src/rpg/render.ts`](../../bots/discord/src/rpg/render.ts) |
| Duel logic           | [`bots/discord/src/rpg/duel.ts`](../../bots/discord/src/rpg/duel.ts)    |
| Trade logic          | [`bots/discord/src/rpg/trade.ts`](../../bots/discord/src/rpg/trade.ts)  |
| Slash command        | [`bots/discord/src/commands/rpg.ts`](../../bots/discord/src/commands/rpg.ts) |
| RPG button router    | [`bots/discord/src/commands/rpg-buttons.ts`](../../bots/discord/src/commands/rpg-buttons.ts) |
| Per-guild state file | `bots/discord/data/rpg/<guild-id>.json` (gitignored)                  |

## PvP duels

Consented 1v1 fights. No open-world ganking — both players must agree.

1. `/rpg duel @bob` — Alice posts a challenge with Accept / Decline buttons. The challenge expires after 60 seconds.
2. Bob clicks **Accept**: the bot runs the full fight immediately using the same `d20 + ATK vs 10 + DEF` formula as PvE combat, then replays the swing log one line per 1.5s.
3. Neither character is permanently damaged. Both are at full HP before and after. The winner gets a small XP bonus (`floor(loserLevel × 5 × 0.1)`), no coins transfer, no item loss.
4. Bob clicks **Decline** (or the 60s window lapses): challenge marked finished, no stat changes.

## Item and coin trading

Consented, atomic swaps of items and coins between two players.

1. `/rpg trade @bob` — opens a trade proposal message visible to the channel.
2. Each side adjusts their offer using **+10 / -10 coin** buttons and item select menus (populated from their inventory).
3. Any change by either side resets both confirmations, so both must always re-confirm after any edit.
4. When both click **Confirm**, the server validates that each player still owns what they offered (guards against race conditions), then performs an atomic swap inside a single `updateWorld` mutation.
5. Either player can click **Cancel** at any time to abort the trade.

Custom ID prefixes:
- `rpg:duel:accept:<id>`, `rpg:duel:decline:<id>`
- `rpg:trade:coins:<id>:<side>:<delta>`, `rpg:trade:item:<id>:<side>`, `rpg:trade:confirm:<id>:<side>`, `rpg:trade:cancel:<id>`

Both `Duel` and `Trade` records live in the per-guild world JSON under `duels` and `trades` keys (default `{}` on load for backward compatibility).

## Design notes

- **No DM role.** The world generates itself and respawns mobs forever.
  This was the biggest change: the old `/dm …` command surface (paint
  terrain, place monsters, run encounters) is gone entirely.
- **No initiative, no turns.** Combat is real-time with a per-player
  cooldown. Mobs counter-attack on the same swing. Feels conversational
  in chat — no "whose turn is it" lookups.
- **Three stats, not six.** HP, ATK, DEF. Anything you might want to
  encode (ability scores, AC, proficiency, saves) collapses into one
  of those three. Death and inventory mechanics that used to need a
  20-field character sheet now fit in ~10 fields.
- **Lazy tick.** Mob movement and spawning happen inline when a player
  acts. No background `setInterval`, no per-guild orchestration, no
  worry about leaking timers when the bot restarts.
- **Coins live on the character, not the gambling wallet.** Easier
  death-drops, and keeps PvE economy separate from `/slots`. The two
  systems share nothing — that's intentional.
- **Procedural maps, seeded by guild id.** A given Discord server
  always lands on the same map, but every server gets its own layout.
  No DM authoring step needed.
- **One file per guild, JSON, human-readable.** Same trade as the rest
  of the project — readability over transactional correctness.
- **Duels don't kill.** The fight resolves on snapshotted HP; real characters are untouched. This keeps PvP low-stakes and avoids griefing.
- **Trades are atomic.** The swap happens inside a single `updateWorld` callback so the per-guild write chain serialises it. No intermediate state is ever flushed.
- **No wagers, no cursed items.** Both are v2 ideas. In v1 every item is freely tradable and duels award only XP.