# D&D / Roleplay

Discord-paced D&D layer on top of the bot. DM authors the world, players
join, AI-controlled monsters take their own turns, and the bot resolves
combat math against a self-contained per-guild JSON world.

## Contents

- [World JSON schema](world-schema.md) — full worked example and constraints
  for the per-guild world file at
  `bots/discord/data/worlds/<guild-id>.json`.

## Command summary

| Group     | Commands                                                                                 |
| --------- | ---------------------------------------------------------------------------------------- |
| Reference | `/roll`, `/spell`, `/monster`, `/item`, `/condition`                                     |
| Character | `/char create`, `/char show`, `/char hp`, `/char condition`, `/char equip`, `/char inv`, `/char delete` |
| DM        | `/dm world …`, `/dm zone …`, `/dm paint …`, `/dm place …`, `/dm shop …`, `/dm encounter …`, `/dm remove`, `/dm narrate` |
| Play      | `/join`, `/leave`, `/init`, `/end-turn`, `/move`, `/look`, `/map`, `/attack`, `/use`, `/shop browse|buy|sell` |
| Coins     | `/coins balance`, `/coins add`, `/slots`, `/blackjack` (shared wallet — gamble for shop money) |

## Quick start

```
DM:     /dm world init name:"Ashen Marches" width:100 height:100
DM:     /dm paint rect row:45 col:38 width:18 height:16 token:.
DM:     /dm paint line from-row:50 from-col:0 to-row:50 to-col:60 token:=
DM:     /dm zone create id:ashfen name:"Ashfen Village" row:45 col:38 width:18 height:16
DM:     /dm world spawn row:50 col:5
DM:     /dm place monster id:goblin-1 srd:goblin row:40 col:68 glyph:👺
DM:     /dm place shop id:shop-smithy name:"Smithy" row:47 col:51 glyph:⚒️
DM:     /dm shop add id:shop-smithy item:longsword price:150 qty:2
Player: /join template:fighter name:Thorin race:dwarf glyph:🛡️
Player: /map world          ← see the campaign overview
Player: /move direction:east steps:5
Player: /shop browse        ← stand next to a shop, browse its wares
Player: /attack target:goblin-1   (inside an encounter)
```

## Source layout

| Concern         | Location                                                                              |
| --------------- | ------------------------------------------------------------------------------------- |
| World store     | [`bots/discord/src/dnd/world.ts`](../../bots/discord/src/dnd/world.ts)                |
| Dice engine     | [`bots/discord/src/dnd/dice.ts`](../../bots/discord/src/dnd/dice.ts)                  |
| SRD client      | [`bots/discord/src/dnd/srd.ts`](../../bots/discord/src/dnd/srd.ts)                    |
| Encounter helpers | [`bots/discord/src/dnd/encounter.ts`](../../bots/discord/src/dnd/encounter.ts)       |
| Monster AI      | [`bots/discord/src/dnd/ai.ts`](../../bots/discord/src/dnd/ai.ts)                      |
| Templates       | [`bots/discord/src/dnd/templates.ts`](../../bots/discord/src/dnd/templates.ts)        |
| Weapons table   | [`bots/discord/src/dnd/weapons.ts`](../../bots/discord/src/dnd/weapons.ts)            |
| Commands        | [`bots/discord/src/commands/`](../../bots/discord/src/commands/)                      |

## Design notes

- **One world per guild.** A Discord server is the natural campaign
  boundary. Simpler than user-named worlds; harder to outgrow than per-
  channel worlds.
- **One PC per player per world.** Multi-character flexibility wasn't worth
  the complexity. Keyed by Discord user id, entity id is `pc-<userId>`.
- **One big overworld, zones are labels.** Earlier versions had each zone
  as its own grid with magic "exits" between them. The current model is a
  single 100×100 (configurable) overworld grid; zones are named rectangles
  over it. Players walk from village to forest to cave on the same grid —
  no teleports. Buildings are wall-clusters; we don't model interiors.
- **Monster stat blocks copied at placement time, not referenced.** An LLM
  reading the world JSON has every stat it needs without external calls.
  Upstream SRD changes don't drift live campaigns. Cost: each world file is
  bigger.
- **Grids are arrays of ASCII strings, emojis only at render time.** Storage
  stays compact and pathing/comparisons stay cheap. The `/map` renderer
  maps each token (and each entity) to an emoji — entities can carry their
  own `glyph` field.
- **Shops use the gambling wallet.** A single `wallets.json` covers both
  gambling and shop transactions, so a broke party can win their starter
  kit at `/slots`. Selling defaults to half-price unless `buyBack` overrides
  per item.
- **JSON, not SQLite.** Same reasoning as the architecture doc: the
  product needs human/LLM readability more than transactional updates.
- **Monster AI is regex-driven.** Action `+X to hit` and damage dice are
  parsed from the SRD action description. If 5e ever changes its
  formatting we'll need to adjust. The alternative (structured fields) was
  rejected because the SRD source doesn't provide them consistently.
- **Loose action economy.** A PC can `/move` and `/attack` multiple times
  per turn — only the movement budget enforces a cap. Strict 5e action /
  bonus action / reaction tracking is a future iteration.
