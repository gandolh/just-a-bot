# Mafia

## Goal

Play Mafia (a.k.a. Werewolf) in a Discord server. Day phase happens in a
thread (open chat, vote to eliminate). Night phase happens via bot DMs
(role-specific actions: kill, save, investigate).

This is the largest feature in the batch. Consider shipping a **v1**
with only three roles (Mafia, Town, Doctor) before tackling the full
roster.

## Command surface

| Command | Effect |
| --- | --- |
| `/mafia start` | Create a game thread, open joining for 60s. Only one active game per guild. |
| `/mafia join` | Join the lobby. Also possible via button on the start message. |
| `/mafia start-now` | Starter can force-start once enough players have joined (min 5 for v1). |
| `/mafia vote target:<@user>` | Cast / change day-phase vote. |
| `/mafia status` | Show current phase, alive players, day number. |
| `/mafia cancel` | Cancel an in-progress game. Starter or admin only. |

Plus DM-only buttons during night phase — no slash command needed for
night actions.

## Data model

Per-guild JSON (RPG pattern). One game per guild.
File: `bots/discord/data/mafia/<guildId>.json`.

```ts
type Role = 'mafia' | 'town' | 'doctor';  // v1; expand later
type Phase = 'lobby' | 'day' | 'night' | 'finished';

type Player = {
  userId: string;
  tag: string;       // captured at join time
  role: Role | null; // null during lobby; assigned at game start
  alive: boolean;
};

type DayVote = { voterId: string; targetId: string };

type NightAction = {
  actorId: string;
  kind: 'kill' | 'save' | 'investigate';
  targetId: string;
};

type MafiaGame = {
  guildId: string;
  threadId: string;
  starterId: string;
  starterChannelId: string;  // where /mafia start was run
  phase: Phase;
  day: number;
  players: Record<string, Player>;
  votes: DayVote[];          // resets each day
  nightActions: NightAction[]; // resets each night
  history: string[];         // narration log, persisted
  lobbyExpiresAt: string | null;
  phaseDeadline: string | null;  // ISO; for day vote / night action timeouts
  createdAt: string;
};
```

Same store skeleton as `rpg/world.ts`: in-memory `Map<guildId, MafiaGame>`,
`Map<guildId, Promise>` write chain, `updateGame(guildId, mutate)`.

## Interaction flow

### Lobby
1. `/mafia start` — refuse if a game already exists for this guild.
   Create a thread off the current channel, post a "Mafia opening — click
   to join" message with a Join button (`maf:join:<gameId>`).
2. Players click Join (or `/mafia join`). Update the message with the
   current player list.
3. After 60s OR when starter runs `/mafia start-now` (≥5 players):
   - Shuffle roles. v1 ratio: 1 mafia per 4 players (rounded down,
     min 1), 1 doctor (only if ≥6 players), rest are town.
   - DM each player their role. The DM has a "Got it" button (`maf:ack:<gameId>`).
   - Set `phase = 'day'`, post "Game started — N players, day 1 begins"
     in the thread (no roles revealed).

### Day phase
- Players chat freely in the thread (no MessageCreate handler needed —
  it's just thread chat).
- `/mafia vote target:@bob` records a vote. Echo "Alice → Bob (3/N)" in
  the thread. Changing vote is allowed.
- When a player gets more than half of alive players' votes, OR the
  phase deadline hits (default 5 minutes), the day ends.
- Eliminated player: reveal their role in the thread, mark
  `alive = false`, transition to night.

### Night phase
- For each role with an action:
  - Mafia (collective): DM each living mafia member a list of living
    non-mafia players as buttons (`maf:kill:<gameId>:<targetId>`). If
    multiple mafia, last vote wins (or unanimous required — v1: last
    vote wins for simplicity).
  - Doctor: DM a list of living players including self (`maf:save:<gameId>:<id>`).
- Wait until all night actions submitted OR night deadline (2 min).
- Resolve: kill happens unless save target == kill target. Post
  "<player> was found dead this morning — they were <role>" (or
  "the night passed peacefully" if save blocked the kill).
- Transition back to day.

### Win conditions (checked after each phase resolution)
- **Town wins**: 0 living mafia.
- **Mafia wins**: living mafia ≥ living town.
- Post a final message in the thread. `phase = 'finished'`. Keep the
  game record for a day (audit), then GC.

### Discord intents
Receiving DMs requires:
- `GatewayIntentBits.DirectMessages`
- `Partials.Channel` (DM channels are partial by default)

Update [bots/discord/src/index.ts:12-19](../../bots/discord/src/index.ts):

```ts
new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,   // ← new
  ],
  partials: [Partials.Channel],         // ← new
});
```

### Button routing
Add `maf:` prefix branch in `index.ts`:

```ts
} else if (interaction.customId.startsWith('maf:')) {
  await handleMafiaButton(interaction);
}
```

## Files to add / modify

**New:**
- `bots/discord/src/mafia/store.ts` — load/save/update per-guild.
- `bots/discord/src/mafia/roles.ts` — role assignment, win-condition checks.
- `bots/discord/src/mafia/phases.ts` — `startDay`, `endDay`, `startNight`,
  `endNight`, deadline timers.
- `bots/discord/src/mafia/dm.ts` — `sendRoleDm`, `sendNightActionDm`.
- `bots/discord/src/mafia/render.ts` — embeds for thread + DM messages.
- `bots/discord/src/commands/mafia.ts` — slash subcommands + `handleMafiaButton`.

**Modified:**
- `bots/discord/src/commands/index.ts` — register `/mafia`.
- `bots/discord/src/index.ts` — intents (above), `maf:` button prefix.

## Open questions / non-goals

- **Role roster v1 = Mafia / Town / Doctor only.** Detective,
  Investigator, Vigilante, Jester, etc. are v2.
- **Phase timers**: implemented with `setTimeout` per game. Survive a
  restart? v1 no — on bot restart, an active game's deadline is lost;
  document as a known limitation and add a "recover" sweep in v2 that
  on boot reads all `data/mafia/*.json` and rehydrates timers.
- **Multiple games per guild**: no. One game at a time.
- **Spectators**: anyone can read the thread chat; dead players keep
  reading but lose chat permissions (set thread message-create perms?
  — Discord lacks per-user thread perms cleanly; v1 just relies on
  honor system + dead role tag).
- **DM failures**: if a player has DMs closed, they can't get their
  role. v1: detect, post in thread "<user> has DMs closed — kicking
  from game", abort if too few players remain.

## Done

Delete this file. Create `docs/mafia/README.md`. This one warrants a
proper write-up — diagram the phase state machine, document the role
assignment math, list the DM intent additions.
