# D&D / Roleplay System — Plan

Living document. Update progress markers as steps complete.

## Goals

A play-by-Discord D&D layer where:

- DM authors the world, zones, NPCs, and encounters.
- Players join with `/join` (pick a template, get a starter sheet) and resume
  whenever they want.
- AI-controlled monsters take their own turns.
- The bot tracks position, initiative, HP, and resolves combat math.
- The entire world is one self-contained JSON file per guild, designed to be
  ingested by an LLM for narration/recap assistance.

## Decisions (locked)

| Topic                | Choice                                                                                  |
| -------------------- | --------------------------------------------------------------------------------------- |
| World scope          | One world per guild                                                                     |
| Combat depth         | Medium — bot rolls attack vs AC, applies HP damage, tracks conditions                   |
| Storage              | JSON per guild at `bots/discord/data/worlds/<guild-id>.json`                            |
| PCs per player       | One PC per player per world (keyed by Discord user id)                                  |
| Monster stat data    | Full stat block copied into JSON at placement time                                      |
| Grid display         | ASCII in code blocks, entities overlaid as letters                                      |
| Character creation   | Templates: Fighter / Wizard / Rogue / Cleric                                            |
| First-time spawn     | `(0,0)` of the first zone; returning players resume at saved position                   |
| Mid-fight join       | Inserted at end of current round                                                        |
| Monster AI           | Move toward closest enemy → attack if in reach (first stat-block action)                |

## World JSON schema

One file per guild. See [`world-schema.md`](world-schema.md). Monster
entities also carry `aiControlled?: boolean` and `srdSlug?: string`.

## Build steps

| #  | Topic                                                | Status | Files                                                                                 |
| -- | ---------------------------------------------------- | :----: | ------------------------------------------------------------------------------------- |
| 1  | World store (per-guild JSON, serialized writes)      |   ✅   | [bots/discord/src/dnd/world.ts](../../bots/discord/src/dnd/world.ts)                       |
| 2  | Character sheet commands                              |   ✅   | [commands/char.ts](../../bots/discord/src/commands/char.ts)                                |
| 3  | DM world-building commands                            |   ✅   | [commands/dm.ts](../../bots/discord/src/commands/dm.ts)                                    |
| 4  | Encounter commands                                    |   ✅   | [dnd/encounter.ts](../../bots/discord/src/dnd/encounter.ts), [commands/init.ts](../../bots/discord/src/commands/init.ts) |
| 5  | Player action commands                                |   ✅   | [commands/play-actions.ts](../../bots/discord/src/commands/play-actions.ts), [dnd/weapons.ts](../../bots/discord/src/dnd/weapons.ts) |
| 6  | `/roll` rewrite to read sheet                         |   ✅   | [commands/roll.ts](../../bots/discord/src/commands/roll.ts)                                |
| 7  | Character templates                                   |   ✅   | [dnd/templates.ts](../../bots/discord/src/dnd/templates.ts)                                |
| 8  | Monster AI (move + attack closest + flavor)           |   ✅   | [dnd/ai.ts](../../bots/discord/src/dnd/ai.ts)                                              |
| 9  | `/join` + `/leave` with mid-encounter insertion       |   ✅   | [commands/join.ts](../../bots/discord/src/commands/join.ts)                                |
| 10 | AI chained through `/end-turn` and `/dm encounter start` | ✅   | [commands/init.ts](../../bots/discord/src/commands/init.ts), [commands/dm.ts](../../bots/discord/src/commands/dm.ts) |

## Player flow (`/join`)

1. Player runs `/join`.
   - If no world exists → message asks DM to run `/dm world init`.
   - If no character exists → require `template` (fighter/wizard/rogue/cleric) +
     `name`. Optional `race` defaults to human. Bot rolls up the sheet from
     the template.
   - If no PC entity for the user → spawn at `(0,0)` of the first zone.
   - If entity already exists → resume at saved position.
2. If an encounter is active → bot rolls initiative for the new PC and
   appends to the order. The new PC acts at the end of the current round
   (after every entity that hasn't yet acted this round).
3. `/leave` removes the player from the active encounter (keeps character &
   position). If the active actor leaves and no combatants remain, the
   encounter ends automatically.

Every command replies. Errors come back as ephemeral messages. Successful
actions reply with an embed (color-coded by category).

## Monster AI

Monsters placed via `/dm place monster` are marked `aiControlled = true` by
default. On their turn:

1. Find the closest living PC in the same zone.
2. Step toward them up to their speed, snapping diagonally where possible
   (Chebyshev) and refusing walls. Honors entity occupancy as obstacles.
3. If in reach of the first stat-block action, attack:
   - Parse `+X to hit` and damage dice from the action description.
   - Roll d20, compare to target AC (nat 20 = crit, nat 1 = auto-miss).
   - Apply damage; mark target unconscious at 0 HP.
4. Post a flavor line (per-slug pool, e.g. goblin/wolf/orc/skeleton/zombie/
   bandit) and a structured action log.
5. Auto-end turn.

If no living PC in zone → wait. If first action is unparseable → log a glare
and end turn.

Chained AI execution: when a player ends their turn (or a fresh encounter
starts), the bot keeps running consecutive AI turns until a PC's turn comes
up. Max 20 chained turns per request to prevent loops.

## Notes & open items

- Players can `/move` and `/attack` multiple times per turn. Only the
  movement budget enforces a per-turn cap. Strict 5e action economy is a
  future step.
- `/cast` is not implemented; players use `/spell <name>` for descriptions
  and the DM adjudicates.
- AI parses attack actions from SRD action text via regex. If the SRD
  changes its wording we may need to revisit.

## Progress log

- 2026-05-20 — Steps 1–6 complete (foundation, sheets, DM, encounters,
  player actions, smart `/roll`).
- 2026-05-20 — Steps 7–10 complete: starter templates, monster AI with
  per-slug flavor, `/join`+`/leave` with mid-fight insertion, AI auto-runs
  after player turns and at encounter start.
