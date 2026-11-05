# RPG

A drop-in multiplayer text RPG. Each Discord server has one shared,
persistent world: six places, from a safe Plaza out to the Deep Woods.
Players explore, fight, loot, shop, level up, and duel or trade with
whoever is standing in the same place. There is no DM, no turn order
between players, and no character sheet to fill in.

Everything after `/rpg start` happens on buttons in a private (ephemeral)
controller that only you see. Duel and trade proposals are the exception:
they are posted in the channel so the other player can answer them.

## Command surface

One slash command, `/rpg`, with three subcommands. It only works in a server.

| Subcommand  | Effect |
| ----------- | ------ |
| `/rpg start` | Enter the world. The first time, it offers a **Create character** button; after that it opens your controller where you left off (in your fight, if you were in one). It also makes this channel the server's town-crier channel. |
| `/rpg exit`  | Step away. Your character stays in the world but is hidden from other players' Nearby lists until you come back. Same as the 🚪 Exit button. |
| `/rpg help`  | A short how-to-play card (private). |

The leaderboards are `/top` with the `rpg-xp`, `rpg-kills` and `rpg-coins`
categories; see [leaderboards](../leaderboards/README.md).

## Quick start

```
Alice: /rpg start              ← private welcome with a "Create character" button
       [Create character]      ← a form opens: name and an optional emoji
       (submit)                ← Alice appears at the Plaza; the controller opens
       [🌲 Whisperwood]        ← travel to a connected place
       [🔍 Explore]            ← "You run into a foe!" — the combat screen
       [⚔ Attack] [⚔ Attack]   ← each press is one round: her swing, then the mob's
                               ← "☠️ Defeated! +12 XP, +3c" — back to the place
       [🏕️ Rest]               ← heal up before the next fight
```

### Creating a character

The **Create character** button opens a form with two optional fields:

- **Character name**, up to 24 characters. Mention syntax (`<@…>`, `<@&…>`,
  `<#…>`), `@everyone`, `@here` and backticks are stripped and runs of
  spaces collapse, so a name can never ping anyone. A blank name, or one
  with nothing left after cleaning, becomes your Discord username (cleaned
  the same way), or "Adventurer" if that is empty too.
- **Emoji**: the first emoji in the field is your glyph. Leave it blank and
  the bot picks one of ten that nobody else in the world is using yet (any
  of the ten once all are taken).

You start at the Plaza with 20 HP, ATK 3, DEF 1, 10 coins, an empty bag and
a starter bounty.

## The controller

The controller is one private message that redraws itself after every
press. Each screen shows your HP bar, effective ATK and DEF, coins, level
and XP to the next level, and a banner line with the result of your last
press. Its footer says it stays live about 15 minutes; if the buttons stop
answering, run `/rpg start` again.

### At a place

| Button | Effect |
| ------ | ------ |
| 🔍 Explore | Search the place: a fight, a find, or nothing (odds below). |
| 🏕️ Rest | Heal 30 % of max HP (at least 3). Free, anywhere, refused at full HP. |
| 🎒 Bag | The bag screen. |
| 📋 Me | Your sheet. |
| 🏪 Town | The shop. Only at the Plaza. |
| Travel buttons | One per connected place. Arriving may start an ambush. |
| 👥 Nearby | Shown only when another player is in the same place. |
| 🚪 Exit | Close the controller and step away, as `/rpg exit`. |

The screen also lists any other players here and your current bounty.

### In a fight

| Button | Effect |
| ------ | ------ |
| ⚔ Attack | One round: you swing, then the mob swings back if it is still standing. |
| 🏃 Flee | Always leaves the fight. 70 % of the time cleanly; otherwise the mob gets one parting swing, which can down you. |
| 🧪 Potion | Drink a Healing Potion (+12 HP, up to max). The mob does not swing back. Disabled with no potion or at full HP. |

While you are in a fight, only these three work. A button on an older
controller (Rest, Explore, Travel, a screen change) answers "You're in a
fight! Attack, flee, or drink a potion." The fight is saved with your
character, so `/rpg start` drops you back into it.

### Bag, Me, Town, Nearby

- **🎒 Bag** lists what you wear and what you carry. Pick an item from the
  menu: a weapon or armor is equipped (the one it replaces goes back in the
  bag), a potion is drunk, a material just says to sell it at the Plaza.
  **🗡 Unequip weapon** and **🛡 Unequip armor** move a worn item back into
  the bag.
- **📋 Me** shows level, XP, HP, ATK and DEF, coins, kills, deaths, where you
  are, what you wear and your bounty. **🎯 Reroll bounty** rolls a new
  bounty at any time, replacing the current one and its progress.
- **🏪 Town** has a buy menu (the catalog below) and a sell menu (your bag).
  Worn items are not in the bag, so they can't be sold or traded until you
  unequip them. A spare copy of something you wear is in the bag and sells
  like anything else.
- **👥 Nearby** lists up to four other players in the same place, each with
  **⚔ Duel** and **🤝 Trade**. A player who used Exit is not listed.

Bag, Me, Town and Nearby each have a **⬅ Back** button to the place.

## How it works

### Places

Each server has the same six places joined the same way; only the names
change, picked per server from a short list (seeded by the server id, so
they never change). The table names each place by its kind. The Plaza's names are The Plaza, Last Light, The
Hollow Market and Travellers' Rest.

| Place | Danger | Mobs | Exits |
| ----- | :----: | ---- | ----- |
| 🟧 Plaza (the hub, the shop) | 0 | none | Meadow, Forest, River |
| 🟩 Meadow | 1 | slime, goblin | Plaza, Forest, Hills |
| 🌲 Forest | 2 | goblin, wolf | Plaza, Meadow, Deep Woods |
| 🟦 River | 2 | wolf, bandit | Plaza, Hills |
| ⛰️ Hills | 3 | bandit, orc | Meadow, River, Deep Woods |
| 🌑 Deep Woods | 4 | orc, troll | Forest, Hills |

**Travel** is one press. Arriving at a place with mobs starts an ambush
with probability 12 % × danger (12 % to the Meadow, 48 % to the Deep Woods);
the Plaza is always safe.

**Explore** at the Plaza finds 1–4 stray coins one time in five and nothing
otherwise. Anywhere else:

| Chance | Outcome |
| -----: | ------- |
| 65 % | A fight with one of the place's mobs, picked evenly |
| 12 % | A Healing Potion, into the bag |
| 10 % | A purse of 2 to 5 + 6 × danger coins |
| 13 % | Nothing |

### Combat math

A swing is a d20 hit check followed by a damage roll, the same for players
and mobs.

```
hit:    d20 + attacker ATK  >=  10 + defender DEF
        natural 1  → always a miss
        natural 20 → always a hit, damage doubled
damage: 1d6 + attacker ATK
```

Players use effective stats (base plus the worn weapon's ATK and armor's
DEF). Every fight starts against a mob at full HP.

**A kill** pays the mob's XP and a coin roll straight into your wallet; each
loot entry is rolled on its own and lands in your bag. **A level** costs 50
XP (level 2 at 50, level 3 at 100, …). Each level gained adds 4 max HP, 1
ATK and 1 DEF and heals you to full.

**Dying** sends you back to the Plaza at full HP and costs you half your
coins (rounded down); they are gone, not dropped. Your bag and equipment
are kept.

### Characters

| Field | Start | Per level |
| ----- | ----- | --------- |
| `hp` / `maxHp` | 20 | +4 max HP, full heal |
| `atk` | 3 | +1 |
| `def` | 1 | +1 |
| `coins` | 10 | — |

### Equipment

Two slots, **weapon** and **armor**. Equipment is never destroyed, worn
down or lost on death.

| Item | Slot | Bonus | Source |
| ---- | ---- | ----- | ------ |
| Rusty Dagger | weapon | +1 ATK | Goblin drop, shop |
| Iron Sword | weapon | +3 ATK | Orc drop, shop |
| Steel Sword | weapon | +4 ATK | Shop only |
| Greatsword | weapon | +5 ATK | Troll drop only |
| Leather Armor | armor | +2 DEF | Bandit drop, shop |
| Chain Mail | armor | +4 DEF | Shop only |

### The Plaza shop

Open **🏪 Town** at the Plaza. The catalog is fixed and the same in every
server, with no stock limits.

| Item | Buy | Sell |
| ---- | --: | ---: |
| Healing Potion | 15c | 6c |
| Rusty Dagger | 25c | 8c |
| Leather Armor | 40c | 15c |
| Iron Sword | 120c | 50c |
| Steel Sword | 220c | 90c |
| Chain Mail | 260c | 100c |

Some things can only be sold: the Greatsword (140c), Slime Jelly (2c),
Wolf Pelt (6c) and Troll Tooth (15c). There are no crafting recipes.

### Bounties

You hold one bounty at a time: "slay N of mob X". A starter bounty is rolled
when the character is made. The kill that completes it pays the reward at
once (the banner adds "🎯 Bounty complete!") and empties the slot; press
**🎯 Reroll bounty** on 📋 Me for the next one. Rolls lean toward mobs near
your level.

| Target | Goal | XP | Coins |
| ------ | ---: | --: | ----: |
| Slime | 5 | 30 | 15 |
| Goblin | 4 | 60 | 30 |
| Wolf | 4 | 90 | 35 |
| Bandit | 3 | 100 | 60 |
| Orc | 3 | 160 | 80 |
| Troll | 1 | 150 | 100 |

### Mobs

| Mob | HP | ATK | DEF | XP | Coins | Loot |
| --- | --: | --: | --: | --: | ----- | ---- |
| Slime | 8 | 2 | 0 | 5 | 0–2 | slime jelly (30 %) |
| Goblin | 14 | 4 | 1 | 12 | 1–5 | rusty dagger (20 %), healing potion (15 %) |
| Wolf | 18 | 5 | 1 | 18 | 0–3 | wolf pelt (40 %) |
| Bandit | 22 | 6 | 2 | 25 | 3–12 | healing potion (25 %), leather armor (10 %) |
| Orc | 32 | 8 | 3 | 40 | 4–15 | iron sword (15 %), healing potion (30 %) |
| Troll | 60 | 12 | 4 | 100 | 10–40 | troll tooth (60 %), greatsword (10 %) |

### The town crier

Level-ups from kills, troll kills, Greatsword finds and deaths are queued as
crier lines (at most 20 waiting). Every 20 seconds the bot posts the latest
eight in one "📜 Town crier" message to the channel where `/rpg start` was
last run in that server. The post pings nobody.

## PvP duels

Consented 1v1 fights, proposed between two players in the same place.

1. Open **👥 Nearby** and press **⚔ Duel** next to the player. The bot posts
   the challenge in the channel with **Accept** and **Decline**; the
   defender is the one member it pings. The challenge expires after 60
   seconds.
2. Only the defender can accept. Either of the two can decline.
3. On Accept the fight is resolved at once with the PvE formula, both
   players starting at full HP with their effective stats, the challenger
   swinging first, for at most 30 rounds. The more HP left wins; a tie is a
   coin flip. The message then replays the swings, one every 1.5 seconds.
4. Nobody is hurt: real HP, coins and items don't change. The winner gets
   XP equal to half the loser's level (rounded down, at least 1), which can
   level them up.

## Item and coin trading

Consented, atomic swaps, proposed between two players in the same place.

1. Open **👥 Nearby** and press **🤝 Trade** next to the player. The bot
   posts a trade card in the channel. The proposer is side A, the other
   player side B.
2. Each side sets its offer: an item menu built from that player's bag (pick
   any of the listed items, one of each) and **+10 / -10 coins** buttons. An
   offer can't go below 0 coins or above what the player has. Only side A's
   player can change side A, and the same for B.
3. Any change clears both confirmations.
4. When both have pressed **✅ Confirm**, the bot checks that each player
   still has the coins and items offered, then swaps everything in one world
   update. If a check fails, both confirmations clear and the presser is
   told why.
5. Either player can press **❌ Cancel** at any time.

## Limits on proposals

Each duel or trade proposal is a public post and a stored record, so they
are limited:

- **One proposal per member every 15 seconds**, duel or trade alike. A
  press inside the window gets "Wait N s before proposing again." The timer
  is in memory, so a restart clears it. A proposal refused before anything
  is posted (the other player left the place, or one of the two rules
  below) doesn't use up the window.
- **One pending duel per pair**, whichever of the two challenged: a second
  challenge is refused until the first is answered or its 60 seconds run
  out.
- **One open trade per pair**, until it completes or is cancelled.

A pending duel doesn't block a trade between the same two players, or the
other way round.

**Pruning.** When a world loads (the first use after a restart) and whenever
a new duel or trade starts, the world drops finished duels and completed or
cancelled trades. A duel or trade that never finished is dropped one day
after it started. An expired challenge is kept until then so that pressing
Accept still says it expired; after that Accept answers "Duel not found."
The buttons of an open trade dropped this way answer "Trade is no longer
open."

## Data and source

### The world file

One JSON file per server, `bots/discord/data/rpg/<guild-id>.json`
(gitignored). The parts that matter:

- `chars`, keyed by user id: `name`, `glyph`, `locationId`, `encounter`
  (the mob kind, its HP and the recent swing lines, or `null`), `hp`,
  `maxHp`, `atk`, `def`, `level`, `xp`, `coins`, `kills`, `deaths`,
  `inventory`, `equipment`, `bounty`, `away`.
- `duels` and `trades`: open proposals (see Pruning).
- `crierChannelId` and `crierQueue`.

The file still carries keys from an older grid-based version of the game
(`grid`, `spawn`, `mobs`, `loot`, `tick`, a character's `pos`,
`lastAttackAt`, `lastMoveAt`, `downUntil`). Nothing reads them. On load,
missing fields get defaults and every character name is cleaned again.

The world is cached in memory. Character creation, `/rpg exit` and every
controller press write the file at once; `/rpg start` and the duel and
trade buttons are written within 2.5 seconds, and shutdown flushes whatever
is pending.

### Source layout

| Concern | Location |
| ------- | -------- |
| Slash command, character factory | [`commands/rpg.ts`](../../../bots/discord/src/commands/rpg.ts) |
| Button, menu and modal router | [`commands/rpg-buttons.ts`](../../../bots/discord/src/commands/rpg-buttons.ts) |
| World model, persistence, mob kinds, name cleaning, pruning | [`rpg/world.ts`](../../../bots/discord/src/rpg/world.ts) |
| The six places | [`rpg/locations.ts`](../../../bots/discord/src/rpg/locations.ts) |
| Controller screens and their actions | [`rpg/locationui.ts`](../../../bots/discord/src/rpg/locationui.ts) |
| Explore and travel rolls | [`rpg/encounter.ts`](../../../bots/discord/src/rpg/encounter.ts) |
| Combat rounds, flee, kills, death | [`rpg/combat.ts`](../../../bots/discord/src/rpg/combat.ts) |
| Duels | [`rpg/duel.ts`](../../../bots/discord/src/rpg/duel.ts) |
| Trades | [`rpg/trade.ts`](../../../bots/discord/src/rpg/trade.ts) |
| Proposal cooldown and pair limits | [`rpg/proposals.ts`](../../../bots/discord/src/rpg/proposals.ts) |
| Items | [`rpg/items.ts`](../../../bots/discord/src/rpg/items.ts) |
| Shop buy and sell | [`rpg/shop.ts`](../../../bots/discord/src/rpg/shop.ts) |
| Bounties | [`rpg/bounty.ts`](../../../bots/discord/src/rpg/bounty.ts) |
| Town crier | [`rpg/crier.ts`](../../../bots/discord/src/rpg/crier.ts) |

Custom ID prefixes (all under `rpg:`, which the router checks first):

- `rpg:create:open`, `rpg:create:submit`
- `rpg:ctl:<action>[:<arg>]`: `screen:<name>`, `explore`, `rest`,
  `travel:<place>`, `fight`, `flee`, `combatpotion`, `bagsel`,
  `unequip:<slot>`, `buysel`, `sellsel`, `bounty`, `duel:<user>`,
  `trade:<user>`, `exit`
- `rpg:duel:accept:<id>`, `rpg:duel:decline:<id>`
- `rpg:trade:coins:<id>:<side>:<delta>`, `rpg:trade:item:<id>:<side>`,
  `rpg:trade:confirm:<id>:<side>`, `rpg:trade:cancel:<id>`

## Design notes

- **No DM.** The places, mobs and loot tables are fixed in code; nobody
  authors a campaign.
- **Places, not tiles.** You are always at one of six named places and move
  between them with one press. There is no map to walk and no mob that
  moves on its own, so nothing happens in a world nobody is playing, and
  the RPG's only background timer is the crier.
- **Fights are private and turn-based.** A fight belongs to one player and
  advances one round per press; other players can't join or steal it.
- **Three stats.** HP, ATK and DEF carry the whole system.
- **Coins live on the character**, not in the gambling wallet. The RPG and
  `/slots` share nothing.
- **One JSON file per server**, readable by a person or an LLM, the same
  trade as the rest of the bot.
- **Duels don't kill.** They run on a copy of each player's HP, so PvP stays
  low-stakes.
- **Trades are atomic.** The swap happens inside one world update, so no
  half-done trade is ever written.
- **Equipment is never lost.** Death already costs half your coins.
- **One bounty at a time**, with no expiry or daily reset.
- **No wagers, no cursed items.** Duels award only XP, and every item can be
  traded.
