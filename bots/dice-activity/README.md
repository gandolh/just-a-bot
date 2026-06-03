# @bots/dice-activity

Discord Activity (voice-channel embedded app) for a **dice-betting table**. Players join a table, ante a fixed number of coins, everyone rolls 2d6, and the biggest roll takes the pot. See [docs/discord/dicetable/README.md](../../docs/discord/dicetable/README.md) for the full spec.

Coins are owned by the Discord bot's wallet (`bots/discord/src/gambling/wallet.ts`); this backend never touches balances — it only validates actions and relays game state. Unlike the old Mafia activity, dice has no hidden information, so there is **no redaction layer**: every connected player receives the same `DiceGameWire`.

## Layout

```
src/
├── server/    Node http + ws backend (tsx-direct, no build)
│   ├── index.ts        bootstrap
│   ├── env.ts          zod-validated env
│   ├── static.ts       serves dist/ with proper cache headers
│   ├── auth.ts         /api/token OAuth exchange → signed session
│   ├── session.ts      HMAC session sign/verify
│   ├── ws.ts           /play (SPA) WS server
│   ├── engine-link.ts  /engine (bot) WS server
│   ├── instances.ts    per-channel instance lifecycle + state broadcast
│   └── dispatcher.ts   SPA → bot action validation + relay
└── client/    Vite + React SPA
    ├── main.tsx        patchUrlMappings FIRST, then mount
    ├── App.tsx         auth + connection bootstrap
    ├── discord.ts      DiscordSDK init
    ├── ws-client.ts    /play WebSocket client
    ├── views/          Lobby / Rolling / Result / NoGame
    └── styles.css
```

## Dev (two terminals)

```bash
# Terminal 1 — backend with watch
npm run dice-activity:dev:server

# Terminal 2 — Vite dev server (Discord URL maps here during dev)
npm run dice-activity:dev:client
```

Plus a Cloudflare named tunnel pointing at the backend (port 3000 by default).

## Production build + run

```bash
npm run dice-activity:build    # vite build → dist/
npm run dice-activity:start    # backend serves dist/ + WS
```

## Dependencies

Backend uses only Node built-ins + `ws` + `zod`. No HTTP framework. The SPA build is the only workspace-level exception to the repo's "no build in run path" rule.
