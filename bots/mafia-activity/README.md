# @bots/mafia-activity

Discord Activity (voice-channel embedded app) for Mafia. Sibling to `@bots/discord`'s existing `/mafia` thread+DM implementation. See [docs/discord/mafia2/README.md](../../docs/discord/mafia2/README.md) for the full spec.

**Status:** milestone 1 — workspace scaffold + hello-world iframe. No OAuth, no engine link, no game logic yet.

## Layout

```
src/
├── server/    Node http + ws backend (tsx-direct, no build)
│   ├── index.ts        bootstrap
│   ├── env.ts          zod-validated env
│   ├── static.ts       serves dist/ with proper cache headers
│   ├── auth.ts         /api/token (stub — milestone 2)
│   └── ws.ts           /play (SPA) + /engine (bot) WS servers
└── client/    Vite + React SPA
    ├── main.tsx        patchUrlMappings FIRST, then mount
    ├── App.tsx         current: hello-world status card
    ├── discord.ts      DiscordSDK init
    └── styles.css
```

## Dev (two terminals)

```bash
# Terminal 1 — backend with watch
npm run mafia-activity:dev:server

# Terminal 2 — Vite dev server (Discord URL maps here during dev)
npm run mafia-activity:dev:client
```

Plus a Cloudflare named tunnel pointing at the backend (port 3000 by default). See the spec's "Dev workflow" section.

## Production build + run

```bash
npm run mafia-activity:build    # vite build → dist/
npm run mafia-activity:start    # backend serves dist/ + WS
```

## Dependencies

Backend uses only Node built-ins + `ws` + `zod`. No HTTP framework. The SPA build is the only workspace-level exception to the repo's "no build in run path" rule.
