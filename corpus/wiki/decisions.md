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
- **Music source: SoundCloud is the (temporary) primary provider; YouTube is the
  disabled secondary.** SoundCloud streams natively via discord-player's default
  extractors — no auth, no yt-dlp, not IP-blocked on the VPS. YouTube
  (discord-player-youtubei + yt-dlp `createStream` override) is kept in code but
  gated behind `YOUTUBE_ENABLED = false` and marked `@deprecated`, because
  YouTube blocks the VPS datacenter IP. Re-enable per
  [todo](../todos/revisit-youtube-provider.md). See [music.md](music.md).
  _(2026-06-26)_
- **Music feature variants ship as sibling commands** (e.g. `dice` → `dice2`,
  `blackjack` → `blackjack2`) sharing extracted code, rather than rewriting the
  original. Same applies to other major UX variants.
