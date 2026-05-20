# World JSON schema

One file per guild at `bots/discord/data/worlds/<guild-id>.json`. The entire
world is one object so an LLM (or a human) can ingest it in a single read.

## Worked example

```jsonc
{
  "guildId": "123456789",
  "name": "The Ashen Marches",
  "dmUserId": "987654321",
  "updatedAt": "2026-05-20T18:00:00Z",

  "characters": {
    "111111111": {
      "name": "Thorin Stoneford",
      "class": "fighter",
      "level": 1,
      "race": "mountain dwarf",
      "abilities": { "str": 16, "dex": 13, "con": 14, "int": 10, "wis": 12, "cha": 8 },
      "proficiencyBonus": 2,
      "proficiencies": {
        "savingThrows": ["str", "con"],
        "skills": ["athletics", "intimidation"]
      },
      "hp": { "current": 12, "max": 12, "temp": 0 },
      "ac": 16,
      "speed": 30,
      "conditions": [],
      "equipped": { "mainHand": "longsword", "armor": "chain-mail" },
      "inventory": [
        { "item": "longsword", "qty": 1 },
        { "item": "shortbow", "qty": 1 },
        { "item": "potion-of-healing", "qty": 1 }
      ],
      "spellSlots": {},
      "knownSpells": [],
      "notes": "Stout and steady."
    }
  },

  "zones": {
    "tavern": {
      "name": "The Sleeping Dragon Tavern",
      "width": 12,
      "height": 8,
      "grid": [
        "############",
        "#..........#",
        "#..........#",
        "#....~~~...#",
        "#....~~~...+",
        "#..........#",
        "#..........#",
        "############"
      ],
      "description": "A warm, smoky room with a hearth at the back.",
      "exits": { "+": { "to": "forest-clearing", "atCell": [4, 11] } }
    }
  },

  "entities": {
    "pc-111111111": {
      "kind": "pc",
      "characterId": "111111111",
      "zone": "tavern",
      "pos": [3, 2]
    },
    "goblin-1": {
      "kind": "monster",
      "name": "Goblin Scout",
      "zone": "tavern",
      "pos": [5, 6],
      "hp": { "current": 7, "max": 7 },
      "ac": 15,
      "conditions": [],
      "aiControlled": true,
      "srdSlug": "goblin",
      "statBlock": {
        "size": "Small",
        "type": "humanoid",
        "alignment": "neutral evil",
        "speed": { "walk": "30 ft" },
        "abilities": { "str": 8, "dex": 14, "con": 10, "int": 10, "wis": 8, "cha": 8 },
        "challengeRating": 0.25,
        "xp": 50,
        "specialAbilities": [],
        "actions": [
          {
            "name": "Scimitar",
            "desc": "Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6+2) slashing damage."
          }
        ]
      }
    }
  },

  "encounter": {
    "zone": "tavern",
    "round": 1,
    "turnIndex": 0,
    "order": [
      { "entityId": "pc-111111111", "initiative": 17 },
      { "entityId": "goblin-1",      "initiative": 12 }
    ],
    "movementBudget": { "pc-111111111": 30, "goblin-1": 30 },
    "log": [
      { "round": 1, "actor": "dm",            "action": "Encounter started in tavern", "rolls": [] },
      { "round": 1, "actor": "pc-111111111", "action": "ended turn",                     "rolls": [] }
    ]
  },

  "story": {
    "currentScene": "tavern-rumors",
    "flags": {},
    "questLog": []
  }
}
```

## Grid tokens

| Token | Meaning            |
| :---: | ------------------ |
|  `.`  | Floor              |
|  `#`  | Wall               |
|  `~`  | Difficult terrain  |
|  `+`  | Door               |
|  `>`  | Stairs down        |
|  `<`  | Stairs up          |

## Entity overlay (render-only)

When rendering a zone:

- PCs: first uppercase letter of their entity id (collisions disambiguated
  positionally).
- Monsters: first lowercase letter of `name`.
- NPCs: `@`.

The overlay is computed at render time; it is not stored in the grid.

## Constraints

- `dmUserId` is required for `/dm *` gating.
- A user has at most one PC per world; their PC entity id is `pc-<userId>`.
- An entity's `pos` must be a valid cell in its `zone`.
- `encounter.order` entries reference existing entity ids.
- `encounter.turnIndex` is `0..order.length-1`; advancing past the end
  increments `round` and wraps to 0.
- Monster `statBlock` is a snapshot taken at placement time.
- `aiControlled` defaults to true for monsters placed via `/dm place monster`.
