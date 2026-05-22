# RPG duels + trading

## Goal

Two extensions to the existing shared RPG world:

- **Duels** — consented 1v1 arena fights. No open-world PvP (no surprise
  ganking on the map). `/rpg duel @user` → challenge → opponent accepts →
  fight resolves in a dedicated arena tile using existing combat math.
- **Trades** — consented item/coin exchange between two players.
  `/rpg trade @user` → both pick what to put on the table → both confirm →
  atomic swap.

Both reuse the existing per-guild RPG store and combat math.

## Command surface

| Command | Effect |
| --- | --- |
| `/rpg duel target:<@user>` | Send a duel challenge. Posts a message with Accept / Decline buttons (`rpg:duel:accept:<duelId>`, `rpg:duel:decline:<duelId>`). |
| `/rpg trade target:<@user>` | Open a trade UI with the user. Posts a message with item selectors + Confirm / Cancel for each side. |

No new top-level commands — both are subcommands of the existing `/rpg`
([bots/discord/src/commands/rpg.ts](../../bots/discord/src/commands/rpg.ts)).

## Data model

Extend the existing `World` shape in [bots/discord/src/rpg/world.ts](../../bots/discord/src/rpg/world.ts):

```ts
type Duel = {
  id: string;
  challengerId: string;
  defenderId: string;
  state: 'pending' | 'active' | 'finished';
  createdAt: string;
  expiresAt: string;  // 60s for pending challenges
  messageId: string;
  channelId: string;
  log: string[];      // swing-by-swing narration
};

type Trade = {
  id: string;
  aId: string;
  bId: string;
  aOffer: { coins: number; items: string[] };
  bOffer: { coins: number; items: string[] };
  aConfirmed: boolean;
  bConfirmed: boolean;
  state: 'open' | 'completed' | 'cancelled';
  messageId: string;
  channelId: string;
};

interface World {
  // …existing fields…
  duels: Record<string, Duel>;
  trades: Record<string, Trade>;
}
```

Both live inside the per-guild world JSON (`data/rpg/<guildId>.json`). No
new files. `updateWorld(guildId, mutate)` is the existing serialized
writer — reuse it.

## Interaction flow

### Duel
1. `/rpg duel target:@bob` — Alice challenges Bob. Append a `Duel` with
   `state: 'pending'`, post a message with Accept/Decline buttons.
2. Bob clicks **Accept** (`rpg:duel:accept:<id>`):
   - Snapshot both characters' HP/stats.
   - Transition `state: 'active'`.
   - Loop until one is at 0 HP: resolve one swing each (using
     `combat.ts:resolveSwing` or whatever exists there), append narration
     to `duel.log`, edit the message with the running log.
   - Brief 1.5s `await sleep` between swings for readability.
3. On finish: restore both characters to full HP (duels don't actually
   kill — they're "to first blood drained"); winner gets a small XP bump
   (10% of opponent's level × 5), no coin transfer, no item loss.
4. **Decline** or 60s expiry → `state: 'finished'`, edit message to
   "challenge declined / expired", no stat changes.

### Trade
1. `/rpg trade target:@bob` opens the trade message:
   - Two columns: "Alice offers" / "Bob offers"
   - Each side has a string-select for items (from their inventory) +
     a "+10 coins" / "-10 coins" pair of buttons.
   - Each side has a Confirm and a Cancel button.
   - Custom IDs: `rpg:trade:item:<id>:<side>`, `rpg:trade:coins:<id>:<side>:<delta>`,
     `rpg:trade:confirm:<id>:<side>`, `rpg:trade:cancel:<id>`.
2. As either side edits their offer, set their `confirmed = false` so any
   change forces both to reconfirm.
3. When `aConfirmed && bConfirmed`:
   - Atomic swap inside one `updateWorld` mutation: subtract from each
     inventory, add to the other; same for coins.
   - Validate both still have what they offered (concurrency safety).
   - Mark `state: 'completed'`, edit message to a final summary.

### Button routing
Add a new prefix in [bots/discord/src/index.ts](../../bots/discord/src/index.ts):

```ts
} else if (interaction.customId.startsWith('rpg:')) {
  await handleRpgButton(interaction);
}
```

`handleRpgButton` dispatches on the second segment (`duel:` / `trade:`).

## Files to add / modify

**New:**
- `bots/discord/src/rpg/duel.ts` — `startDuel`, `acceptDuel`, `runDuel`,
  `declineDuel`, expiry sweep.
- `bots/discord/src/rpg/trade.ts` — `startTrade`, `updateOffer`,
  `confirm`, `cancel`, `executeTrade`.
- `bots/discord/src/commands/rpg-buttons.ts` — `handleRpgButton(interaction)`.

**Modified:**
- `bots/discord/src/rpg/world.ts` — add `duels` + `trades` to `World`,
  default them to `{}` in `generateWorld` and any migration path on load.
- `bots/discord/src/commands/rpg.ts` — add `duel` and `trade` subcommands.
- `bots/discord/src/index.ts` — `rpg:` button prefix route.

## Open questions / non-goals

- **Arena tile**: v1 = no separate tile, fight resolves purely in
  messages without moving characters. v2 could teleport both to a
  dedicated coordinate.
- **Wagers** on duels (coin bets): v2. Would need an escrow flow.
- **Trading between offline players**: no. Both must run the commands
  during the same session.
- **Sticky items** (cursed, soulbound): no such concept yet. All items
  are tradable.

## Done

Delete this file. Update `docs/rpg/README.md` (it already exists) with a
new section for duels + trades. Update the `/rpg` subcommand table at the
top of that file.
