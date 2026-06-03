# Dice Table — `/dicetable`

A voice-channel **Activity** (embedded app): players join a table, ante a fixed
number of coins, everyone rolls 2d6, and the biggest roll takes the whole pot.
Ties split the pot evenly. This replaced the former Mafia Activity — it reuses
the same Activity plumbing (OAuth, session, `/play` + `/engine` WebSockets,
per-channel instance lifecycle) but the game protocol is far simpler because
dice has **no hidden information**.

## Command surface

`/dicetable launch` — posts a link that opens the Activity for the current
voice channel. The Activity can also be opened directly via the VC rocket-ship.
No thread, no DMs.

## Architecture

```
┌────────────┐   /engine WS    ┌─────────────────────┐   /play WS    ┌────────┐
│ bots/discord│ ◀────────────▶ │ bots/dice-activity   │ ◀──────────▶ │ iframe │
│  (engine +  │   (state +      │  (validate + relay)  │  (state /     │  SPA   │
│   wallet)   │    actions)     │                      │   actions)    │        │
└────────────┘                 └─────────────────────┘               └────────┘
```

- **bots/discord** owns the game engine *and* the coin wallet
  (`src/gambling/wallet.ts`). All phase transitions, rolling, and payouts happen
  here. State is persisted per-guild as `DiceGameWire` JSON under
  `data/dicetable/`.
- **bots/dice-activity** is a stateless BFF: it validates SPA actions against
  the latest known state and relays them to the bot; it broadcasts the bot's
  state pushes to every connected SPA socket. It never touches coins and does
  **no redaction** (everyone sees the same `DiceGameWire`).
- The wire protocol lives in `shared/src/dice-protocol.ts`.

## Game flow

1. **Lobby** — the first player to open the table picks an ante (`create`,
   default 100) and is debited immediately. Others `join` and are each debited
   the same ante into the pot. A 60s timer auto-rolls; the host can `roll-now`
   early. Minimum 2 players — if the timer fires with fewer, every ante is
   refunded and the table closes.
2. **Rolling** — each player rolls 2d6 (`rollPair()` from
   `src/gambling/dice.ts`). Highest total wins; the pot is credited to the
   winner(s). Ties split evenly, remainder to the first tied player by join
   order.
3. **Finished** — every player's dice + total and the winner(s) are shown for
   ~30s, then the table clears so the channel can host another.

If all players leave the Activity, the backend waits 30s then sends
`instance-ended`; the engine refunds antes (only if still in lobby) and clears
the table.

## Config (env)

Discord bot (`bots/discord/.env`) — all optional; if unset the command still
registers but reports "not configured" and the engine link stays down:

```
DICE_ACTIVITY_WS_URL    # ws(s)://host/engine — bot connects here
DICE_ACTIVITY_TOKEN     # shared secret, ≥16 chars; matches backend ENGINE_AUTH_TOKEN
DICETABLE_ACTIVITY_URL  # https URL the /dicetable launch message links to
```

Activity backend (`bots/dice-activity/.env`):

```
DISCORD_CLIENT_ID
DISCORD_CLIENT_SECRET
SESSION_HMAC_KEY        # ≥16 chars
HTTP_PORT=3000
ENGINE_LISTEN_PORT=3100
ENGINE_AUTH_TOKEN       # ≥16 chars; matches bot DICE_ACTIVITY_TOKEN
```

## Dev

```bash
npm run dice-activity:dev:server   # backend (watch) on :3000, /engine on :3100
npm run dice-activity:dev:client   # Vite dev server on :3001
npm run discord:dev                # bot, with DICE_ACTIVITY_* set
```

Plus a Cloudflare named tunnel to the backend so Discord's URL mappings reach
it.

## Notes / limits

- Insufficient-funds on `join` is best-effort: the SPA's `join` is
  fire-and-forget, so a player who can't cover the ante simply never appears in
  the table (the engine declines the debit and pushes unchanged state).
- One table per voice channel; one record per guild.
