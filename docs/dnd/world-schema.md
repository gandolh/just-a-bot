# World JSON schema

One file per guild at `bots/discord/data/worlds/<guild-id>.json`. The world is
one big object holding the entire campaign — a single overworld grid, labeled
regions ("zones"), entities placed by overworld coordinates, character sheets,
and an optional active encounter.

## Model

- **Overworld**: a single rectangular grid (default 100×100) covering the
  whole campaign. Stored as an array of ASCII strings, one per row. Each cell
  is one terrain token.
- **Zones**: named, labeled rectangular *regions* of the overworld. They do
  not have their own grid — they're just `{ name, description, bounds }`.
  Used for "where am I" lookups and flavor.
- **Entities**: PCs, monsters, NPCs, and shops. All have an overworld
  `pos: [row, col]`. No `zone` field — the zone you're in is derived from
  your position.
- **Roads**: cells painted `=` on the overworld. Just a terrain hint for
  safe travel; no special mechanics yet.
- **Coins**: shops use the existing gambling wallet
  (`bots/discord/data/wallets.json`). A poor party can win some coin at
  `/slots` or `/blackjack` and come back to outfit themselves.

## Terrain tokens (overworld grid)

| Token | Meaning            | Render   | Walkable | Notes                  |
| :---: | ------------------ | :------: | :------: | ---------------------- |
|  `.`  | Open ground        | 🟫       | yes      |                        |
|  `=`  | Road               | 🟧       | yes      | flavor: safe path      |
|  `f`  | Forest             | 🌲       | yes      | 2× movement cost       |
|  `#`  | Wall / building    | ⬛       | no       |                        |
|  `~`  | Water              | 🟦       | no       |                        |
|  `^`  | Mountain           | ⛰️       | no       |                        |
|  `+`  | Door               | 🚪       | yes      |                        |
|  `>`  | Stairs down        | 🔽       | yes      |                        |
|  `<`  | Stairs up          | 🔼       | yes      |                        |

## Entity glyphs

Each entity (and each character sheet) may carry an optional `glyph` —
any emoji string. The map renderer uses it when drawing that entity's cell.
Defaults if absent:

- PC: 🧙   (use the character sheet's glyph if set)
- NPC: 🧑
- Monster: 👹
- Shop: 🏪

## Worked example

```jsonc
{
  "guildId": "123",
  "name": "The Ashen Marches",
  "dmUserId": "987",
  "updatedAt": "2026-05-20T18:00:00Z",

  "overworld": {
    "width": 100,
    "height": 100,
    "grid": [
      "....................~~...........................^^^",
      "..(99 more rows of the same width)..."
    ]
  },

  "characters": {
    "111": {
      "name": "Thorin",
      "glyph": "🛡️",
      "class": "fighter",
      "level": 1,
      "race": "mountain dwarf",
      "abilities": { "str": 16, "dex": 13, "con": 14, "int": 10, "wis": 12, "cha": 8 },
      "proficiencyBonus": 2,
      "proficiencies": { "savingThrows": ["str", "con"], "skills": ["athletics"] },
      "hp": { "current": 12, "max": 12, "temp": 0 },
      "ac": 16,
      "speed": 30,
      "conditions": [],
      "equipped": { "mainHand": "longsword", "armor": "chain-mail" },
      "inventory": [{ "item": "longsword", "qty": 1 }],
      "spellSlots": {},
      "knownSpells": [],
      "notes": ""
    }
  },

  "zones": {
    "ashfen": {
      "name": "Ashfen Village",
      "description": "A muddy hamlet ringed by the Greywood.",
      "bounds": { "row": 45, "col": 38, "width": 18, "height": 16 }
    }
  },

  "entities": {
    "pc-111": { "kind": "pc", "characterId": "111", "pos": [50, 45] },
    "npc-brenna": {
      "kind": "npc", "name": "Brenna the Innkeeper", "glyph": "👩‍🦰",
      "pos": [53, 39], "dialogue": "Find my daughter!"
    },
    "shop-smithy": {
      "kind": "shop", "name": "Garrick's Smithy", "glyph": "⚒️",
      "pos": [47, 51], "greeting": "Steel and shoe-nails.",
      "inventory": [
        { "item": "longsword", "price": 150, "qty": 2 },
        { "item": "dagger", "price": 10, "qty": 10 }
      ]
    },
    "goblin-1": {
      "kind": "monster", "name": "Goblin Scout", "glyph": "👺",
      "pos": [40, 68],
      "hp": { "current": 7, "max": 7 }, "ac": 15, "conditions": [],
      "statBlock": { "...": "..." },
      "aiControlled": true, "srdSlug": "goblin"
    }
  },

  "encounter": null,

  "story": {
    "currentScene": "tavern-rumors",
    "flags": { "spawn": [50, 5] },
    "questLog": [
      { "id": "find-maeve", "title": "Find Maeve", "done": false }
    ]
  }
}
```

## Constraints

- `dmUserId` is required for `/dm *` gating.
- A user has at most one PC per world; entity id is `pc-<userId>`.
- An entity's `pos` must be in `[0..overworld.height) × [0..overworld.width)`.
- Walls (`#`), water (`~`), and mountains (`^`) block movement.
- Zone `bounds` must fit inside the overworld; zones may overlap (the first
  match wins for "where am I").
- Monster `statBlock` is a snapshot taken at placement time.
- `aiControlled` defaults to true for monsters placed via `/dm place monster`.
- `story.flags.spawn` is `[row, col]` — the default `/join` placement.
- Shop `inventory[i].qty` is optional; absent = unlimited stock.

## Coins / shops bridge

Shops debit and credit the per-user gambling wallet (`addCoins`, `tryDebit`).
There is no separate "gold" field on the character sheet. Selling pays
`buyBack[item]` if defined, otherwise floor(price/2). Buying requires the PC
to be within 1 Chebyshev cell of the shop's position.
