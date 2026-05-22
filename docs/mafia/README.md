# Mafia

A full Mafia (Werewolf) game playable inside a Discord server. The day phase happens in a thread — open discussion, slash-command voting. The night phase happens via bot DMs: role-specific action buttons sent privately to each role player.

## Command surface

A single slash command, `/mafia <sub>`:

| Subcommand | Effect |
| --- | --- |
| `/mafia start` | Create a game thread, open a 60s lobby. One active game per guild. |
| `/mafia join` | Join the open lobby. Also available via the Join button posted in the thread. |
| `/mafia start-now` | Starter force-starts the game once ≥ 5 players have joined. |
| `/mafia vote target:@user` | Cast or change your day-phase vote. Echoes the current tally. |
| `/mafia status` | Show current phase, day number, and alive players (ephemeral). |
| `/mafia cancel` | Cancel an in-progress game. Starter or admin only. |

Night actions (kill, save) are handled via DM buttons — no slash command needed.

## How it works

### Phase state machine

```
             /mafia start
                  │
                  ▼
              ┌───────┐  60s or /mafia start-now
              │ LOBBY │ ────────────────────────►  assign roles, DM each player
              └───────┘
                  │
          ┌───────▼───────┐
          │               │
          ▼               │
        ┌─────┐         win?─────► FINISHED
        │ DAY │  5 min    │
        │     │  deadline │
        └──┬──┘           │
           │ majority vote│
           │ or deadline  │
           ▼              │
        ┌──────┐          │
        │NIGHT │  2 min   │
        │      │  deadline│
        └──┬───┘          │
           │ all actions  │
           │ or deadline  │
           └──────────────┘
```

### Lobby

`/mafia start` creates a public thread in the current text channel and posts an embed with a **Join Game** button (`maf:join:<guildId>`). Players can click the button or use `/mafia join`. After 60 seconds (or immediately via `/mafia start-now` with ≥ 5 players) the game launches: roles are assigned, each player is DM'd their role, and the day phase begins.

If a player has DMs closed, they are removed from the roster with a notice in the thread. If too few players remain after removal, the game cancels.

### Day phase

Players chat freely in the thread. `/mafia vote target:@user` records a vote and echoes `Voter → Target (N/Total)` publicly. A player with a strict majority (> 50% of alive players) is eliminated immediately; their role is revealed. If the 5-minute deadline hits with no majority, the plurality winner is eliminated (ties = no elimination). After elimination the win condition is checked; if met, the game ends; otherwise night begins.

### Night phase

- **Mafia**: each living mafia member receives a DM with buttons listing all living non-mafia players (`maf:kill:<guildId>:<targetId>`). The last submitted kill vote wins (v1 — no unanimity required).
- **Doctor**: the doctor receives a DM with buttons listing all living players including themselves (`maf:save:<guildId>:<targetId>`).

Once all role-players have submitted or the 2-minute deadline fires, the night resolves: the kill fires unless the doctor saved the same target. The result is announced in the thread ("X was found dead — they were [role]" or "the night passed peacefully"). Day then restarts.

### Win conditions

Checked after every day and night resolution:

| Condition | Winner |
| --- | --- |
| 0 living mafia | Town |
| living mafia ≥ living non-mafia | Mafia |

A final embed reveals all roles.

### Role assignment math

| Players | Mafia | Doctor | Town |
| --- | --- | --- | --- |
| 5 | 1 | 0 | 4 |
| 6 | 1 | 1 | 4 |
| 7 | 1 | 1 | 5 |
| 8–11 | 2 | 1 | rest |
| 12–15 | 3 | 1 | rest |

Formula: `mafia = max(1, floor(n / 4))`, `doctor = n >= 6 ? 1 : 0`, rest are town.

## Source layout

| Concern | Location |
| --- | --- |
| Types + persistence | `bots/discord/src/mafia/store.ts` |
| Role assignment + win conditions | `bots/discord/src/mafia/roles.ts` |
| Phase transitions + timers | `bots/discord/src/mafia/phases.ts` |
| DM sending helpers | `bots/discord/src/mafia/dm.ts` |
| Embed + button builders | `bots/discord/src/mafia/render.ts` |
| Slash commands + button handler | `bots/discord/src/commands/mafia.ts` |
| Per-guild state file | `bots/discord/data/mafia/<guild-id>.json` (gitignored) |

## Design notes

- **DM intents**: `GatewayIntentBits.DirectMessages` and `Partials.Channel` are required in the Discord client to receive DM interactions. These were added to `bots/discord/src/index.ts`.
- **Button prefix `maf:`**: all mafia buttons use `maf:<action>:<guildId>[:<targetId>]` and are dispatched in the global `InteractionCreate` handler.
- **One game per guild**: the store holds a single nullable record per `guildId`. Starting while a game exists (non-finished phase) is rejected.
- **Phase timers via `setTimeout`**: the day timer is 5 minutes; the night timer is 2 minutes. These live in memory only — a bot restart loses active deadlines. This is a known v1 limitation; a v2 recovery sweep could rehydrate timers from the JSON files on boot.
- **Thread creation**: uses `ChannelType.PublicThread` on a `TextChannel`. The bot needs the Manage Threads permission in the target channel.
- **Dead players**: remain visible in the thread (no per-user thread permission control in Discord v1). The game relies on the honor system; a dead-player role assignment is a v2 nicety.
- **Role roster v1**: Mafia, Town, Doctor only. Detective, Vigilante, Jester, and others are deferred to v2.
