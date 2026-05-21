# D&D

A lightweight D&D 5e-style campaign layer for Discord. One player is the
**DM**: they narrate by typing slash commands and the bot posts the
message as the storyteller, NPC, or scene-setter. The other players each
have a character with HP, AC, ability scores, and inventory. The bot
handles dice, initiative, and HP bookkeeping so the DM can focus on the
story.

Lives alongside the per-server [RPG sandbox](../rpg/README.md). Pick
whichever fits the table: RPG is the always-on procedural world; D&D is
a structured campaign with a human DM.

## Roles

| Role       | What they do                                                   |
| ---------- | -------------------------------------------------------------- |
| **DM**     | Sets scenes, runs NPCs, narrates, controls monsters and pace.  |
| **Player** | Plays one character. Rolls checks, attacks, speaks in voice.   |

The first person to run `/dnd setup` becomes the DM. They cannot also
play a PC. One campaign per server at a time.

## Command surface

A single slash command, `/dnd <sub>`:

### Setup

| Subcommand        | Who   | Effect                                                          |
| ----------------- | ----- | --------------------------------------------------------------- |
| `/dnd setup`      | anyone | Start a campaign in this channel; caller becomes the DM.       |
| `/dnd end`        | DM    | Wipe the campaign.                                              |
| `/dnd status`     | anyone | Show DM, party, monsters, initiative.                          |

### Player — character

| Subcommand                 | Effect                                                       |
| -------------------------- | ------------------------------------------------------------ |
| `/dnd join name class …`   | Create your PC (race, HP, AC, str/dex/con/int/wis/cha opts). |
| `/dnd leave`               | Remove your character.                                       |
| `/dnd sheet [player]`      | View your sheet (or another player's, public).               |
| `/dnd hp <delta>`          | Adjust your HP (`+5` heals, `-7` damages).                   |

### Anyone — rolls + roleplay

| Subcommand                              | Effect                                                          |
| --------------------------------------- | --------------------------------------------------------------- |
| `/dnd roll <expr> [reason] [mode]`      | Roll dice: `1d20+5`, `2d6`, `4d6-1`. `mode` = adv/dis.          |
| `/dnd check ability:<x> [mode] [skill]` | d20 + your ability mod. Optional skill label (`Perception`).    |
| `/dnd say <text>`                       | Speak in character — bot posts as your PC, no command-author chrome. |

### DM — narration (bot posts as storyteller)

| Subcommand                          | Effect                                                       |
| ----------------------------------- | ------------------------------------------------------------ |
| `/dnd narrate <text>`               | DM voice. Posts an italic narration embed.                   |
| `/dnd npc <name> <text>`            | NPC dialogue with the given speaker name.                    |
| `/dnd scene <title> <description>`  | Set the scene with a titled embed; saved to campaign state.  |
| `/dnd whisper <player> <text>`      | DM the player privately (Discord DM).                        |
| `/dnd dmroll <expr> [reason] [mode]`| Hidden roll — only the DM sees the result (ephemeral).       |

### DM — combat

| Subcommand                                  | Effect                                                |
| ------------------------------------------- | ----------------------------------------------------- |
| `/dnd init`                                 | Roll initiative for every PC (DEX mod) and monster.   |
| `/dnd next`                                 | Advance to the next combatant; rolls round on wrap.   |
| `/dnd endcombat`                            | Clear the initiative order.                           |
| `/dnd monster name hp ac [init]`            | Spawn a tracked monster. Gets an id like `m1`.        |
| `/dnd damage <target> <amount>`             | Apply damage to a PC or monster (mention/name/id).    |
| `/dnd heal <target> <amount>`               | Same, healing direction. PCs and monsters supported.  |

### DM — bookkeeping

| Subcommand                  | Effect                                       |
| --------------------------- | -------------------------------------------- |
| `/dnd xp <amount>`          | Award XP to every player.                    |
| `/dnd give <player> <item>` | Add an item to a player's inventory.         |

## Quick start

```
GM: /dnd setup                       ← becomes the DM
Alice: /dnd join name:Astrid class:Ranger race:Elf hp:14 ac:15 dex:16 wis:14
Bob:   /dnd join name:Hrok    class:Fighter race:Human hp:18 ac:16 str:16

GM: /dnd scene title:"The Drowned Crypt" description:"Salt water laps at your boots…"
GM: /dnd npc name:"The Captain" text:"You'll need to be quick. The tide returns at dusk."
GM: /dnd narrate "Behind the altar, something exhales."

GM: /dnd monster name:"Ghoul" hp:22 ac:12 init:2
GM: /dnd init                        ← rolls initiative for all
Alice: /dnd check ability:dex skill:Stealth mode:adv
Alice: /dnd roll 1d20+5 reason:"longbow attack"
GM: /dnd damage target:Hrok amount:7
GM: /dnd next
…
GM: /dnd xp amount:150
GM: /dnd give player:@Alice item:"silvered arrow"
```

## How it works

### Persistence

One JSON file per guild at `bots/discord/data/dnd/<guild-id>.json`
(gitignored). Loaded lazily, write-through on every mutation, same shape
as the RPG world state.

### Character model

```ts
{
  name, race, klass, level,        // narrative
  hp, maxHp, ac,                   // combat
  abilities: { str, dex, con, int, wis, cha },
  inventory: string[],
  xp,
}
```

Ability modifier = `floor((score - 10) / 2)` — vanilla 5e math.
Defaults if a `/dnd join` option is omitted: HP 10, AC 12, all
abilities 10.

### Monster model

DM-only, tracked by id (`m1`, `m2`, …). Just name + HP + AC + initiative
bonus. No full stat block — the DM rolls attacks with `/dnd roll`
themselves, since stat blocks vary too much to encode usefully.

### Dice

Expression parser accepts `XdY`, `XdY+Z`, `XdY-Z`. Count 1–50, sides
2–1000. The `mode` option promotes a single die to advantage (roll twice,
keep highest) or disadvantage (keep lowest); for multi-die expressions
it's ignored. Output shows individual rolls and the total.

### Initiative

`/dnd init` rolls `d20 + DEX mod` for every PC and `d20 + initBonus` for
every tracked monster, sorts descending, and records the turn pointer.
`/dnd next` advances the pointer; on wrap, increments the round counter.
A monster reaching 0 HP is removed from both the encounter and the
initiative order automatically.

### "Bot speaks as the DM"

For `/dnd narrate`, `/dnd npc`, `/dnd scene`, and `/dnd say`, the
command:

1. Defers reply ephemerally.
2. Posts the embed to the channel via `channel.send()`.
3. Deletes the ephemeral placeholder.

That hides the "User used /dnd narrate" chrome, so what readers see is a
clean bot message in the storyteller's voice.

### Permissions

DM-only subcommands check `campaign.dmId === interaction.user.id` and
reply ephemerally if anyone else tries. No Discord role plumbing — the
campaign state is the source of truth.

## Source layout

| Concern              | Location                                                                |
| -------------------- | ----------------------------------------------------------------------- |
| Campaign state       | [`bots/discord/src/dnd/state.ts`](../../bots/discord/src/dnd/state.ts)  |
| Dice parser + roller | [`bots/discord/src/dnd/dice.ts`](../../bots/discord/src/dnd/dice.ts)    |
| Slash command        | [`bots/discord/src/commands/dnd.ts`](../../bots/discord/src/commands/dnd.ts) |
| Per-guild data       | `bots/discord/data/dnd/<guild-id>.json` (gitignored)                    |

## Design notes

- **One DM, no DM swaps.** Switching DM mid-campaign would mean either
  letting players claim the role (abuse) or building an ownership-transfer
  command (more surface than this is worth). End the campaign and re-setup.
- **DM cannot also be a PC.** Same actor controlling both narration and a
  PC defeats the whole point of the role split. Enforced at `/dnd join`.
- **Monsters are minimal.** Name, HP, AC, init bonus. Anything else
  (attacks, saves, special abilities) the DM rolls by hand with `/dnd
  roll`. Trying to encode 5e stat blocks would multiply the surface area
  without giving the DM more power than they already have.
- **No turn enforcement.** `/dnd next` advances the pointer but doesn't
  block other commands. Players can still act out-of-turn — the DM
  adjudicates. Matches how tabletop actually works.
- **Bot-as-narrator pattern via defer+delete.** Discord doesn't offer a
  first-class "post as bot, attribute to nobody" path for slash commands.
  The defer-ephemeral / channel.send / delete-ephemeral dance gets us
  there cleanly.
- **No DM role plumbing.** The DM is whoever ran `/dnd setup`, stored in
  one JSON field. No Discord roles to manage, no permission overrides.
