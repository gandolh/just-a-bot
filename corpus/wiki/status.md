---
summary: Dated snapshot of where the project stands right now — one line per area: the repo is now Discord-only, music is shelved, /dicetable is dormant.
updated: 2026-08-27
---

# Status — 2026-08-27

Where things stand right now.

## Music (`/play`) — SHELVED

- **Disabled.** The music commands (play/skip/pause/resume/stop/queue/nowplaying)
  are **commented out** of [commands/index.ts](../../bots/discord/src/commands/index.ts)
  so they don't appear in Discord. No VPS-viable audio source: YouTube IP-blocked,
  yt-dlp same, SoundCloud returns previews/empty streams (all join voice then play
  ~120 ms and finish). Full resume plan + history:
  [reenable-music.md](../todos/reenable-music.md).
- **Code kept intact:** SoundCloud-primary + `skipFFmpeg:false` in
  [player.ts](../../bots/discord/src/player.ts), YouTube disabled behind
  `YOUTUBE_ENABLED`, yt-dlp cookies wired (`YT_COOKIES_FILE`),
  `music:update-ytdlp` script, brief 01 quality work. Re-enabling is mostly
  uncommenting once a source streams from the VPS.
- **Likely endgame:** Lavalink, or YouTube via residential proxy. See the todo.

## Scope — Discord-only since 2026-08-27

`bots/slack`, `bots/whatsapp` and `bots/dice-activity` were removed; <!-- stale-ok --> workspaces
are now `shared` + `bots/discord`. Rationale and the non-obvious consequences:
[decisions.md](decisions.md). Typecheck clean after the trim.

**`/dicetable` is dormant** — it is a WebSocket client of the removed Activity
app, so `shared/src/dice-protocol.ts` is still live code but there is no server
in this repo. The command answers "not configured" rather than failing. See
[open-questions.md](open-questions.md).

## Tooling / knowledge layers

- **Root [CLAUDE.md](../../CLAUDE.md)** now exists — a fresh session is pointed at
  `corpus/index.md` instead of discovering the repo by grep.
- **`docs/` ↔ `corpus/` boundary settled** (2026-08-27): `docs/` is the how
  (per-feature operating manuals, setup, triage), `corpus/` is the why, and
  `docs/` ranks last in the source-of-truth order. Both front doors say so. Two
  drifted `docs/` pages were corrected — the music page had described the shelved
  feature as working.
- **Code graph installed** — `codegraph` 1.6.0, global, MCP in `.mcp.json`.
  Re-benchmarked after the trim: `impact` exact, transitive and 13.5× cheaper;
  `explore` only 1.6× (ruled out); 12 duplicate names still conflate, so never
  rename off it. See [code-graph.md](code-graph.md).

## Queued work

- **[Brief 02](../briefs/todo/02-remove-dicetable.md)** — remove `/dicetable`:
  the feature, its command, 3 env vars, `shared/src/dice-protocol.ts`, the docs
  page, and the `bots/dice-activity/` leftover incl. its `.env`.
- **[Brief 03](../briefs/todo/03-remove-ytdlp-path.md)** — remove the yt-dlp
  streaming path (dep, `streamWithYtDlp`, `createStream`, `YT_COOKIES_FILE`,
  `music:update-ytdlp`). The youtubei extractor, `YOUTUBE_ENABLED` and
  `YT_COOKIE` stay. **After this, flipping `YOUTUBE_ENABLED` no longer works** —
  no stream source behind it.

Both are independent (02 touches no music code, 03 touches no dicetable code) and
neither is implemented yet.

## Corpus

Updated to corpus-flow 0.29.0 (2026-08-27): `summary:`/`updated:` frontmatter on
every wiki page, a generated `index.md` catalog, [lint.sh](../lint.sh), a
[glossary](glossary.md), knowledge routing in [routing.md](../routing.md), and
`decisions.md` reformatted with rejected alternatives + reasons. The code-graph
half of the spec is deliberately not installed — see
[todo](../todos/add-code-graph-layer.md).

## Rest of the bot

Many features in place (games, gambling, AI chat, image gen, reminders, RPG,
D&D). Not yet catalogued in the corpus — pages will be added as work touches
them; their operating manuals are under [`docs/discord/`](../../docs/discord/README.md).

## Maintenance note

The bundled yt-dlp binary must be kept current (`yt-dlp -U`); `npm install` may
reset it to the pinned version. Stale yt-dlp is a recurring YouTube-breakage
risk.
