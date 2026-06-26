# Decisions (locked)

Settled tech/design choices. Don't relitigate without an explicit revisit + a
`log.md` note.

- **npm workspaces** (`shared` + `bots/*`), not pnpm/yarn.
- **Run TypeScript directly via `tsx`** — no build step for the bots. ESM with
  explicit `.ts` import suffixes.
- **Node ≥ 22.12** (root `engines`).
- **pm2** for process management (`ecosystem.config.cjs`).
- **Env validated with Zod** through `@bots/shared`'s `loadEnv` — fail fast on
  bad config; optional integrations degrade to "not configured" rather than
  crash.
- **Music: discord-player 7.2.0 + discord-player-youtubei (beta) for
  metadata/search, but stream via yt-dlp** (`youtube-dl-exec`) through a
  `createStream` override — the youtubei.js stream cascade is unreliable under
  YouTube's SABR/PO-token enforcement. See [music.md](music.md). _(2026-06-26)_
- **Music feature variants ship as sibling commands** (e.g. `dice` → `dice2`,
  `blackjack` → `blackjack2`) sharing extracted code, rather than rewriting the
  original. Same applies to other major UX variants.
