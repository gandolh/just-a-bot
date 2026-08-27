---
summary: Dated snapshot of where the project stands right now — Discord-only, music removed outright, /dicetable queued for removal.
updated: 2026-08-27
---

# Status — 2026-08-27

Where things stand right now.

## Music — REMOVED

Gone as of 2026-08-27: 333 lines and all eight audio dependencies
(`npm install` dropped 275 packages). Reviving it is a **rebuild**, not an
uncomment. Post-mortem with the findings worth keeping:
[music.md](music.md). Plan, including the one cheap test that was never run:
[reenable-music.md](../todos/reenable-music.md).

Hold is active — the user is researching a provider that works from a datacenter
IP without cookie refreshing.

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
  drifted `docs/` pages were corrected at the time; the music page has since been
  deleted with the feature.
- **Code graph installed** — `codegraph` 1.6.0, global, MCP in `.mcp.json`.
  Re-benchmarked after the trim: `impact` exact, transitive and 13.5× cheaper;
  `explore` only 1.6× (ruled out); 12 duplicate names still conflate, so never
  rename off it. See [code-graph.md](code-graph.md).

## Queued work

- **[Brief 02](../briefs/todo/02-remove-dicetable.md)** — remove `/dicetable`:
  the feature, its command, 3 env vars, `shared/src/dice-protocol.ts`, the docs
  page, and the `bots/dice-activity/` leftover incl. its `.env`.
- ~~Brief 03~~ — superseded before execution and
  [moved](../briefs/superseded/03-remove-ytdlp-path.md): its scope (remove yt-dlp
  only) was widened the same day to removing the whole subsystem, which is done.

Brief 02 is not implemented yet.

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
