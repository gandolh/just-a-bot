# Mafia2 — TODO

Status: **not started**. Design spec only. No code exists yet.

A second Mafia implementation that runs as a Discord **Activity** (voice-channel embedded app) instead of a thread + DMs. Lives alongside the existing `/mafia` — both ship, the original is untouched. Shared game-logic code is fine (extract into `shared/` or `bots/discord/src/mafia/` as needed); UX paths stay separate.

## Pitch

Voice-channel Mafia where the **day phase is the centerpiece**: a live tension dashboard. Players in the VC click the rocket-ship, the Activity loads inside the call, and the day phase becomes a real-time vote board with arrows pointing from voter portraits to accused portraits, redrawing as players waver. Night phase is role-private — each client renders only what its role is allowed to see.

## Command surface

`/mafia2 launch` — posts a button that opens the Activity for the current voice channel. The Activity can also be opened directly via the VC rocket-ship without a slash command. No thread.

The existing `/mafia` keeps its current thread + DM flow untouched.

---

## Platform constraints (Discord Activities)

These constraints are load-bearing for the rest of the spec. Read first.

- **SDK is `@discord/embedded-app-sdk` v2.x** (v2.0.0 March 2025, v2.5.0 May 2026). Pin the major version in `package.json`. v1.x examples on the web have different `shareLink`, missing `GetUser` / `GetRelationships` / activity-invite commands. [CHANGELOG](https://github.com/discord/embedded-app-sdk/blob/main/CHANGELOG.md).
- **All outbound network calls go through Discord's proxy.** WebRTC is *unsupported*; WebTransport is *not yet enabled*. WebSocket is the only real-time option. [Discord networking docs](https://docs.discord.com/developers/activities/development-guides/networking).
- **`patchUrlMappings()` must be the literal first thing the SPA executes** — before React mounts, before any library import that touches `fetch`/`WebSocket`/`XMLHttpRequest`. It monkey-patches the globals; anything that captured the original constructors before the patch will bypass the proxy and get blocked by Discord's CSP. The patch must also match the URL mappings registered in the Developer Portal — same prefixes, exact strings. [WavePlay CSP post](https://blog.waveplay.com/discord-proxy-csp-patch/), [embedded-app-sdk #240](https://github.com/discord/embedded-app-sdk/issues/240).
- **Unverified Activity caps:** ≤25-member guilds only, 50 explicit tester slots, ≤100-member dev team. Activity Shelf and broader discoverability require Discord verification review. Plan a dedicated test guild from day 1. [Verified vs Unverified](https://support-dev.discord.com/hc/en-us/articles/26576097154199-What-are-Verified-and-Unverified-Activities).
- **`rpc.voice.read` scope requires Discord approval** before production use. We need it for speaking indicators *and* for seeing VC members who haven't opened the Activity. **Decision:** degrade gracefully — request the scope, but if not granted, the SPA drops speaking rings and the lobby shows only Activity participants (not all VC members).
- **The Activity iframe is fully inspectable** via Discord desktop's DevTools. Treat the client as hostile: server-side redaction of role-private state *and* server-side validation of every action (sender's role + current phase + alive status + target legality). Discord's own docs: "Do not trust data coming from the Discord client as truth."
- **Mobile WebSocket fails on iOS ≤16 and Android 7** through the proxy. Open issue, no official workaround ([discord-api-docs #7054](https://github.com/discord/discord-api-docs/issues/7054)). SPA must detect failure and render a "please update Discord / your OS" screen instead of an infinite spinner.
- **AudioContext starts in `suspended` state.** Sound effects need `audioCtx.resume()` triggered by the *first user gesture* (vote click, lobby-join tap). Not on SDK ready.
- **Discord aggressively caches iframe assets.** `index.html` must be served with `Cache-Control: no-cache, must-revalidate`; all JS/CSS must use content-hash filenames (Vite default for chunks, but verify for `index.html` entry). [Chips of Fury post-mortem](https://chipsoffury.com/blog/discord-activity/).

## Architecture

```
┌────────────────────┐         ┌──────────────────────────┐         ┌──────────┐
│  bots/discord      │  WS     │  bots/mafia-activity     │  WS     │  iframe  │
│  (engine + Discord │ ──────► │  (BFF: WS server, redact │ ──────► │  SPA     │
│   gateway)         │ ◄────── │   + validate, serve      │ ◄────── │  (React) │
└────────────────────┘         │   static)                │         └──────────┘
        ▲                      └──────────────────────────┘                │
        │  state diffs out, actions in (already validated)                 │
        └─────────── validated actions ────────────────────────────────────┘
```

- **Engine source of truth:** `bots/discord/`. Reuse the existing `src/mafia/` module where possible; extend role enum + night-action kinds to cover the v1 suite.
- **State direction:** bot is the WS *client*; the Activity backend is the *server*. Bot reconnects on its own restart. Activity backend survives bot restarts and shows "engine reconnecting…".
- **Two-layer trust boundary:**
  1. **Redaction** — Activity backend filters state per socket by Discord userId → role. Never leaks other players' roles in serialized frames.
  2. **Validation** — every inbound `action` message is checked against the sender's current role, the current phase, alive status, and the legality of the target *before* it's forwarded to the bot. Redaction without validation is not enough; an attacker who knows the protocol can send arbitrary messages.

## New workspace: `bots/mafia-activity/`

Frontend + thin backend, single workspace. SDK pinned at `@discord/embedded-app-sdk` ^2.5.

```
bots/mafia-activity/
├── package.json            workspace, depends on @bots/shared
├── src/
│   ├── server/             WS server, OAuth exchange, static serving — tsx-direct
│   │   ├── index.ts        bootstrap
│   │   ├── ws.ts           per-socket session, redaction, ACTION VALIDATION
│   │   ├── auth.ts         OAuth code exchange, HMAC session signer
│   │   ├── instances.ts    instanceId ↔ channelId reconciliation
│   │   └── engine-link.ts  WS client-of-bot
│   └── client/             SPA — Vite + React, build emits dist/
│       ├── main.tsx        FIRST LINE: patchUrlMappings([...])
│       ├── App.tsx
│       ├── components/     LobbyView, DayDashboard, NightView, RoleCard, …
│       ├── audio.ts        AudioContext + first-gesture resume
│       └── ws-client.ts
├── vite.config.ts          dist with hashed bundles, no-cache on index.html
└── tsconfig.json
```

**Build path exception:** backend stays tsx-direct like the rest of the repo. The SPA is the one place a build step is unavoidable. Document in `docs/discord/architecture.md` as a deliberate carve-out.

## State sync protocol (WS)

Two WS channels with different message shapes.

### Bot ↔ Activity backend (`/engine`)

| Direction | Message | Payload |
| --- | --- | --- |
| bot → activity | `state` | full `MafiaGame` JSON |
| bot → activity | `diff` | minimal patch (optional optimization, after v1) |
| activity → bot | `action` | `{userId, kind, targetId?}` — **already validated** |
| activity → bot | `lobby-start` | `{channelId, hostUserId}` |
| activity → bot | `lobby-join` | `{channelId, userId, tag}` |
| activity → bot | `instance-ended` | `{channelId}` — last participant left; bot cancels the game |

### SPA ↔ Activity backend (`/play`)

| Direction | Message | Payload |
| --- | --- | --- |
| SPA → activity | `hello` | `{instanceId, sessionToken}` |
| activity → SPA | `state` | redacted state |
| SPA → activity | `action` | `{kind, targetId?}` — userId inferred from socket session |

### Validation rules (in `ws.ts`)

Every inbound `action` must pass *all* of:

- session token verifies and is unexpired,
- sender's userId is a player in the current game,
- sender is alive,
- current phase permits the action kind (vote→day, lock-vote→day, kill→night+mafia, save→night+doctor, investigate→night+detective, vigilante-kill→either+vigilante & not-yet-used),
- target (if any) is a valid alive player.

Reject without forwarding to the bot. Log rejects (potential cheaters or stale clients).

### Redacted state, per role

- **Town / dead:** game state with all `role` fields stripped except their own.
- **Mafia:** game state + co-mafia roles visible + `nightTargets` during night.
- **Doctor:** game state + `nightTargets` during night.
- **Detective:** game state + their previous investigation results.
- **Vigilante:** game state + whether their one-shot is still available.
- **Jester:** standard town redaction (their role is private from town).

## Day-phase dashboard — interaction spec

- Portraits in a circle (desktop) / list (mobile). Arrow from voter → accused, animated on update.
- Click any alive portrait to **point your vote**. Click again to retract. Click another to switch.
- Live tally bubble on each accused portrait.
- At `T-30s`, a **LOCK** button appears below your own portrait. Locked votes get a padlock icon visible to everyone.
- Day ends when **all alive players have locked** OR **timer hits 0**.
- Resolution: strict majority of alive → elimination. Plurality on timeout → elimination unless tied (ties = no elimination). Role card flips on elimination.
- Speaking indicator: animated ring around portraits of players currently talking, *if* `rpc.voice.read` scope is granted. If not, ring is omitted — no error.

## Night-phase UX

- All clients see moon + fog + ambient sound. "Night N" counter.
- **Town / Jester / dead:** atmosphere + timer only.
- **Mafia:** side panel with alive non-mafia portraits → click to vote a kill target. Co-mafia votes visible. Last vote wins.
- **Doctor:** side panel with all alive portraits (including self) → click to save.
- **Detective:** side panel with all alive non-self portraits → click to investigate. Result shown only to detective on the next day's screen.
- **Vigilante:** if shot is unused, side panel with alive non-self portraits. Can use during day too (TBD — see Open questions). Once used, the panel disappears for the rest of the game.
- Night ends when all role-action holders have submitted OR `T=0`.

## Lobby

- VC user clicks the Activity rocket-ship. SPA loads.
- If no game exists for this `{guildId, channelId}`: lobby screen with **Start game** button (anyone can press). Min 5 players. 60s auto-start timer once threshold met.
- If a game is already in progress: **spectator mode** (read-only dashboard, no role assignment, no actions accepted).
- **VC member visibility limitation:** the lobby roster only shows players who have *opened the Activity*. Players sitting in the VC without launching the iframe are invisible to `ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE`. To show them too we'd need `VOICE_STATE_UPDATE` (gated by `rpc.voice.read`); v1 ships without and accepts the limitation.
- **Role pack:** full suite in v1 (see Roles). No configurable role-pack toggle in v1; v2 feature.

## Identity / auth

Standard `@discord/embedded-app-sdk` v2 flow:

1. SPA calls `discordSdk.commands.authorize({ scope: ['identify', 'guilds.members.read', 'rpc.voice.read'] })` → code. The `rpc.voice.read` scope may be rejected if not yet approved by Discord; treat that as "speaking indicators off" and continue.
2. SPA POSTs the code to `/api/token` on the activity backend.
3. Backend exchanges with Discord (`POST /oauth2/token`) using the app's client secret. Gets `access_token` (`expires_in: 604800` ≈ 7 days, per [discord-api-docs #4755](https://github.com/discord/discord-api-docs/issues/4755)).
4. Backend fetches `/users/@me` → confirms `userId`, `username`, `avatar`.
5. Backend signs a session token (HMAC over `{userId, channelId, instanceId, exp}`) and returns it to the SPA. **Session expiry: 2h** (much shorter than the access token — sessions are scoped to one game).
6. SPA presents the session token in the `hello` WS frame and on each subsequent WS reconnect.

**Token lifecycle notes:**

- Access tokens cannot be refreshed from the client in an Activity context — the code exchange is one-shot per launch. A new Activity instance triggers a new OAuth flow. Acceptable for Mafia (games are short).
- If the session token expires mid-game (>2h, an outlier), the SPA must re-run the OAuth flow.

Secrets in `bots/mafia-activity/.env`, zod-validated like the existing `env.ts`:

```
DISCORD_CLIENT_ID
DISCORD_CLIENT_SECRET
SESSION_HMAC_KEY
ENGINE_LISTEN_PORT       # WS port the bot connects to
HTTP_PORT                # HTTP/static + /play WS
```

## Instance lifecycle

Reconciling Discord's `instanceId` with our channel-keyed game state.

- **Game key (bot side):** `guildId + channelId`. Same as existing `/mafia`. JSON file at `bots/discord/data/mafia/<guildId>.json` (current per-guild scope; if multiple channels-per-guild is ever wanted, this needs to change — out of scope for v1).
- **Session key (activity backend side):** `instanceId`. Backend keeps `instances: Map<instanceId, {channelId, sockets}>`.
- **Mapping table:** `activeGames: Map<channelId, instanceId>` — at most one active game per channel.
- **New instance for a channel with an active game:** by decision, the previous game is cancelled. Activity backend sends `instance-ended` to the bot for the old `instanceId`, bot clears the JSON store, then the new instance starts fresh. Documented as user-visible behavior: "If everyone leaves the Activity, the game ends."
- **Detecting 'all participants left':** Activity backend tracks open sockets per `instanceId`. When count drops to 0, debounce 30s, then emit `instance-ended`. The debounce avoids killing the game on a brief network hiccup.
- **Bot restart:** `setTimeout`-based phase deadlines are lost (inherited from existing engine). On `state` re-push after restart, Activity backend can re-derive deadlines from `phaseDeadline` ISO strings already in the model. Engine should add a rehydration sweep on boot — fixes both `/mafia` and `/mafia2`.

## Audio + sensory

- **AudioContext gating:** create on SPA init; `await audioCtx.resume()` inside the *first* user-gesture handler (lobby-join click, etc.). Without this, sound effects are silently dropped on iframe load. [MDN](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay).
- **Thermal state:** subscribe to `THERMAL_STATE_UPDATE`. On `critical`, drop the vote-arrow animation frame rate and pause non-essential sounds. Required for Discord verification on mobile.
- **Volume:** Activity audio mixes with Discord voice — keep effects under 0.3 gain by default, expose a settings slider.

## Persistence

Keep the existing JSON-on-disk model under the bot. Activity backend holds no durable state; it rebuilds from the bot's last `state` push on (re)connect. Preserves "JSON is the product answer" and keeps the bot the only filesystem writer.

## Roles in v1

Full suite:

| Role | Night ability | Day ability | Notes |
| --- | --- | --- | --- |
| Mafia | Vote a kill target | — | Last vote wins (current engine behavior) |
| Doctor | Save one player (incl. self) | — | |
| Detective | Investigate, learn role | — | Result shown next day, only to detective |
| Vigilante | One-shot kill | (optional — TBD) | Use once per game; see Open questions |
| Jester | None | None | Wins if voted out during day |
| Town | None | Vote | |

Engine extensions required:

- `Role` union: add `'detective' \| 'vigilante' \| 'jester'`.
- `NightAction['kind']`: add `'vigilante-kill'` (and re-enable `'investigate'`, currently defined but unused in `store.ts:25`).
- `MafiaGame`: add `vigilanteUsed: Record<string, boolean>`, `investigations: Array<{day:number, actorId, targetId, learnedRole}>`.
- `checkWin`: handle jester win condition (jester eliminated by day vote → jester wins, game ends, town and mafia *both* lose). Order matters: check jester first.
- `assignRoles`: rewrite. Suggested table for v1 (subject to playtest):

| Players | Mafia | Doctor | Detective | Vigilante | Jester | Town |
| --- | --- | --- | --- | --- | --- | --- |
| 5 | 1 | 1 | 0 | 0 | 0 | 3 |
| 6 | 1 | 1 | 1 | 0 | 0 | 3 |
| 7 | 2 | 1 | 1 | 0 | 0 | 3 |
| 8 | 2 | 1 | 1 | 1 | 0 | 3 |
| 9 | 2 | 1 | 1 | 1 | 1 | 3 |
| 10 | 3 | 1 | 1 | 1 | 1 | 3 |
| 11–12 | 3 | 1 | 1 | 1 | 1 | rest |
| 13+ | floor(n/4) | 1 | 1 | 1 | 1 | rest |

## Mobile + accessibility

Per Discord verification requirements, mobile is a release-gate, not a nice-to-have.

- **Safe-area insets:** `--discord-safe-area-inset-*` CSS vars are *not populated* on first render — only after an orientation change ([embedded-app-sdk #304](https://github.com/discord/embedded-app-sdk/issues/304)). Use `env(safe-area-inset-*)` as the fallback in CSS.
- **WebSocket failure on iOS ≤16 / Android 7:** detect handshake failure (timeout >5s on first WS connect attempt); render a static "please update Discord or your OS to play Mafia2" card. Don't loop.
- **Layout fallback:** at narrow widths (<480px), portraits become a vertical stack with vote-arrow icons replacing literal arrows. Day dashboard switches from circle to list.
- **Touch:** all click targets ≥44px square.

## Dev workflow

- `npm run mafia-activity:dev` → Vite dev server (3001) + tsx watch on backend (3000).
- **Named Cloudflare tunnel** (not `--url` ephemeral): `cloudflared tunnel create mafia2-dev` once, configure DNS to a stable subdomain (e.g. `mafia2-dev.example.com`), then `cloudflared tunnel run mafia2-dev` in dev. Avoids constantly updating the Developer Portal URL mapping. [Source](https://chipsoffury.com/blog/discord-activity/).
- **Discord Developer Portal:** enable embedded-app, set root URL mapping → stable tunnel hostname, register `/api/*` for backend HTTP, register `/play` and `/engine` for WS endpoints. The `patchUrlMappings([...])` array in the SPA must match these exactly.
- **Dedicated test guild** (≤25 members) — unverified Activities can't be launched in larger guilds. Bot is invited only here during dev.
- Bot started separately via `npm run discord:start`; reads `ENGINE_ACTIVITY_WS_URL` env.
- **Cache headers in production:** Vite emits `dist/assets/*.[hash].{js,css}` automatically. The backend's static handler must set `Cache-Control: no-cache, must-revalidate` on `index.html` and `Cache-Control: public, max-age=31536000, immutable` on hashed assets.

## Launch checklist (Discord verification)

Items required before requesting Discord's verification review (graduates the Activity out of the 25-member cap into the Activity Shelf):

- [ ] Mobile portrait layout works on iOS + Android Discord clients.
- [ ] Safe-area insets respected on first render (env() fallback).
- [ ] Thermal-state handling demonstrated (degrade animation on `critical`).
- [ ] All click targets ≥44px.
- [ ] `THERMAL_STATE_UPDATE`, `ORIENTATION_UPDATE`, `LAYOUT_MODE_UPDATE` subscribed.
- [ ] Audio respects mute / does not autoplay before gesture.
- [ ] WebSocket-failure error screen on unsupported mobile.
- [ ] Privacy policy + terms-of-service URLs configured.
- [ ] `rpc.voice.read` scope approval requested (separate review).

## Open questions

- **Vigilante balance:** night-only one-shot kill, or any-phase one-shot? Any-phase is more dramatic but skews mafia odds. Recommend night-only for v1.
- **Detective false-positive nights:** classic Mafia balance trick is the detective sometimes gets misleading results. Skip for v1 (already complex enough).
- **Spectator chat:** none in v1 — spectators use the VC.
- **Reconnect (single player, brief network blip):** session token survives; SPA reopens WS with the same token, BFF restores the existing socket-userId mapping. Already implicit but should be tested.
- **Multi-channel per guild:** current bot keys games by `guildId` only. If two voice channels in the same guild both want to play, only one wins. Out of scope for v1.

## Milestones (rough)

1. **Workspace scaffolding** — `bots/mafia-activity/` with empty backend + Vite + React shell. `patchUrlMappings` in place. Hello-world iframe loadable in Discord via named cloudflared tunnel.
2. **OAuth + session** — `/api/token` exchange, HMAC session, WS `hello` handshake.
3. **Engine link** — bot connects to activity backend WS, pushes existing game state from a manually-started game. SPA renders a JSON dump. Proves the pipe end-to-end.
4. **Instance lifecycle** — channelId↔instanceId reconciliation, `instance-ended` debounce, game-cancel-on-empty.
5. **Lobby + day dashboard** — extract reusable engine code, wire start/vote/lock through SPA. Existing 3 roles only.
6. **Validation layer** — server-side action validation. Audit by deliberately sending malformed actions from DevTools.
7. **Night phase + redaction** — first new mechanic. Verify in DevTools that no other player's role leaks.
8. **Full role suite** — detective, vigilante, jester. Each new role = redaction rule + UI panel + win-condition update.
9. **Mobile pass** — safe areas, WS-failure screen, portrait stack fallback, thermal handling, touch targets.
10. **Audio + polish** — sound effects with gesture resume, speaking indicators (if scope granted), animations.
11. **Verification submission** — launch checklist green, submit to Discord review.

## Out of scope for v1

- Configurable role packs per lobby.
- Cross-guild play / matchmaking.
- Persistent stats / leaderboard integration (revisit after v2).
- Spatial audio.
- Replays.
- Multi-channel-per-guild games.
- Detective false-results balance.
