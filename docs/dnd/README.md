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
| DM        | `/dm world …`, `/dm zone …`, `/dm place …`, `/dm encounter …`, `/dm remove`, `/dm narrate` |
| Play      | `/join`, `/leave`, `/init`, `/end-turn`, `/move`, `/look`, `/attack`, `/use`             |

## Quick start

```
DM:     /dm world init name:"Test"
DM:     /dm zone create id:room name:"Stone Room" width:10 height:8
Player: /join template:fighter name:Thorin race:dwarf
DM:     /dm place monster id:goblin-1 srd:goblin zone:room row:5 col:7
DM:     /dm encounter start zone:room entities:"pc-<userId>,goblin-1"
Player: /attack target:goblin-1
Player: /end-turn   ← AI-controlled goblin runs its turn automatically
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
- **Monster stat blocks copied at placement time, not referenced.** An LLM
  reading the world JSON has every stat it needs without external calls.
  Upstream SRD changes don't drift live campaigns. Cost: each world file is
  bigger.
- **Grids are arrays of strings, not 2D arrays of cells.** LLM- and
  human-readable, trivially editable, no JSON noise. Entities are stored
  separately from grid cells so terrain underneath remains visible and
  multiple entities can occupy a cell at render time if needed.
- **JSON, not SQLite.** Same reasoning as the architecture doc: the
  product needs human/LLM readability more than transactional updates.
- **Monster AI is regex-driven.** Action `+X to hit` and damage dice are
  parsed from the SRD action description. If 5e ever changes its
  formatting we'll need to adjust. The alternative (structured fields) was
  rejected because the SRD source doesn't provide them consistently.
- **Loose action economy.** A PC can `/move` and `/attack` multiple times
  per turn — only the movement budget enforces a cap. Strict 5e action /
  bonus action / reaction tracking is a future iteration.
