# Log

Chronological record of meaningful corpus + project changes. Newest last.

## [2026-06-26] maintenance | corpus bootstrapped

Created `corpus/` at repo root: CLAUDE.md, index.md, log.md, routing.md, and
the wiki spine (overview, architecture, decisions, status, open-questions) plus
a [music](wiki/music.md) concept page. Seeded from the repo structure and the
in-flight music work.

## [2026-06-26] ingest | music playback fixed (joins-but-silent)

YouTube SABR/PO-token enforcement broke `discord-player-youtubei`'s youtubei.js
stream cascade — tracks resolved (so they "queued") but produced no audio. Fixed
by adding a `createStream` override in
[player.ts](../bots/discord/src/player.ts) that streams via `youtube-dl-exec`
(`bestaudio`) directly, bypassing the flaky client cascade + SABR. Updated the
bundled yt-dlp binary 2026.03.17 → 2026.06.09. See [music.md](wiki/music.md).

## [2026-06-26] todo | brief 01 filed — music audio quality + code cleanup

Set `/play` `volume: 100` (skips discord-player's PCM volume filter). Filed
[brief 01](briefs/done/01-music-audio-quality.md) for further audio-quality and
music-code improvements.

## [2026-06-26] incident | DiscordAPIError 40060 on /play (duplicate interaction)

`/play` threw "Interaction has already been acknowledged" (40060) at
`deferReply`. **Root cause: the same `DISCORD_TOKEN` was running in two places at
once — local `discord:dev` AND the VPS (pm2) deployment.** Discord delivers each
interaction to every live gateway session of a bot, so both instances ran
`execute` and called `deferReply`; the loser of the race 40060'd. Verified there
is only one local process and exactly one `InteractionCreate` listener in code,
so it is NOT a double-registered listener, NOT a music bug, and NOT (primarily)
the tsx-watch reload overlap.

Fix / rule: one running instance per bot token. Best practice — use a **separate
Discord application + token for local dev** (set in local `.env`), leaving the
VPS on the production token; `env.ts` + `GUILD_ID` already support this with no
code change.

A graceful SIGINT/SIGTERM shutdown was also added to
[index.ts](../bots/discord/src/index.ts) (`client.destroy()` on exit) — good
hygiene for clean `tsx watch` reloads and pm2 restarts, but not the cause here.
The `ephemeral: true` deprecation warning (142 sites) is separate and still open.

## [2026-06-26] incident | VPS music silent — YouTube anti-bot block

After ruling out the duplicate-instance 40060 (ran VPS-only), `/play` still
joined and was silent while all other commands worked. `pm2 logs` showed yt-dlp
exiting code 1 with `Sign in to confirm you're not a bot` — YouTube blocks the
Hetzner datacenter IP and won't stream without auth (works on residential/local
IPs). Fix: added `YT_COOKIES_FILE` env → passed to yt-dlp as `--cookies` in
[player.ts](../bots/discord/src/player.ts) `streamWithYtDlp`. User must drop a
Netscape `cookies.txt` on the VPS and set the env var. See
[music.md](wiki/music.md).

## [2026-06-26] decision | Music feature shelved — commands disabled

SoundCloud also failed on the VPS: extraction + voice connect succeed, but the
test track returned a 0:30 preview and even `skipFFmpeg:false` left it at
`playbackDuration: 120` ms then finished (empty/unreadable preview stream). With
YouTube IP-blocked and yt-dlp same, no direct-from-VPS source works. Shelved the
feature: commented the 7 music commands out of
[commands/index.ts](../bots/discord/src/commands/index.ts) (hidden from Discord);
all code kept intact. Full resume plan + saga in
[reenable-music.md](todos/reenable-music.md). Likely endgame: Lavalink or YouTube
+ residential proxy.

## [2026-06-26] decision | SoundCloud primary, YouTube disabled secondary

With no low-maintenance cookie-free way past YouTube's VPS IP block, switched the
music source: **SoundCloud** is now the temporary primary provider (active,
streams natively, `SOUNDCLOUD_SEARCH`), and **YouTube** is the disabled secondary
(`YOUTUBE_ENABLED = false` in [player.ts](../bots/discord/src/player.ts), yt-dlp
path kept + `@deprecated`). Music commands stay live. Filed
[todo](todos/revisit-youtube-provider.md) to re-enable YouTube later. Wiki:
[music.md](wiki/music.md), [decisions.md](wiki/decisions.md).

## [2026-06-26] done | Brief 01 — music audio quality + code cleanup

Shipped: `volume: 100`; yt-dlp format `bestaudio[acodec=opus]/bestaudio`
(WebM/Opus @ 48 kHz, Discord-native — ffmpeg remuxes instead of transcoding AAC);
new `commands/_music.ts` `getActiveQueue` helper deduping the six music control
commands; root `music:update-ytdlp` script. Typecheck clean; script verified.
True Opus passthrough deferred (needs live voice test) — see
[open-questions.md](wiki/open-questions.md). Brief →
[done](briefs/done/01-music-audio-quality.md).

## [2026-08-27] maintenance | corpus updated to corpus-flow 0.29.0

Brought `corpus/` up to the current skill spec (was bootstrapped against an
earlier version). Changes:

- **Frontmatter** — `summary:` + `updated:` added to all six wiki pages, written
  as a retrieval signal for an agent deciding whether to open the page.
- **[lint.sh](lint.sh)** (new) — five mechanical checks (wiki/todo frontmatter,
  every relative link resolves, ≤200 body lines, backticked repo paths still
  exist, no orphan wiki pages), exits non-zero so it can gate a commit;
  `--index` regenerates the [index.md](index.md) catalog from the summaries.
  Verified against a deliberately broken copy — each check fires independently.
- **[index.md](index.md)** — catalog is now generated, states the retrieval
  budget, and no longer duplicates the brief catalog that
  [status.md](wiki/status.md) owns.
- **[CLAUDE.md](CLAUDE.md)** — added the retrieval budget (index + ≤2–3 pages),
  the wiki-spine descriptions, `log.md` entry kinds incl. `resume`, the
  why-vs-what split, and verify-before-quoting.
- **[routing.md](routing.md)** — added the knowledge-routing table (question
  shape → wiki / code / grep / tests).
- **[glossary.md](wiki/glossary.md)** (new) — six terms with `_Avoid_` lists,
  resolving real drift: *provider* (the service) vs *extractor* (the code that
  talks to it), and *shelved* vs removed vs disabled.
- **[decisions.md](wiki/decisions.md)** — reformatted to one entry per call with
  date, rejected alternatives, and reason; added the music-shelving decision;
  npm-workspaces flagged as undefended (reason predates the corpus).
- Lint fixes found on the way: [open-questions.md](wiki/open-questions.md)
  pointed at brief 01 in `todo/` (it's in `done/`), and
  [music.md](wiki/music.md) described the providers as active without saying the
  commands are commented out — now banner-flagged as shelved.

Deliberately **not** done: the code-graph layer (§0b) needs a pinned dependency
and a committed `.mcp.json`, which is a repo change rather than a doc update —
filed as [todo](todos/add-code-graph-layer.md) with the case for and against.
No `test-plans/` layer either (no browser UI).

## [2026-08-27] maintenance | repo-level adoption: root CLAUDE.md, docs boundary, lint script

The four repo changes outside `corpus/` that the 0.29.0 update exposed.

- **Root [CLAUDE.md](../CLAUDE.md)** (new) — the corpus was invisible at session
  start: nested `CLAUDE.md` files only load once a file in that directory is
  read, so a fresh agent got nothing pointing it at `corpus/index.md` and would
  grep `bots/` instead. It carries the retrieval budget, the docs/corpus
  boundary, and the repo gotchas (no build step, `.ts` suffixes, typecheck, one
  instance per bot token).
- **`npm run corpus:lint`** — added to the root `package.json`. No git hook: it
  would be untracked and would block commits, so it stays a command.
- **`docs/` ↔ `corpus/` reconciled.** See the decision entry; short version is
  both layers stay, split why vs how, with `docs/` last in the source-of-truth
  order. `docs/README.md` and `docs/common/architecture.md` now say so and link
  the corpus; `corpus/CLAUDE.md`, `index.md`, `routing.md`, `overview.md` and
  `architecture.md` link back.
- Two genuinely wrong `docs/` pages fixed: `docs/discord/music/README.md`
  described the shelved music feature as "wired up and functional" on
  YouTube-primary (rewritten — shelved banner, SoundCloud-primary, the two
  cookie env vars distinguished, triage updated); `docs/common/architecture.md`
  omitted `bots/dice-activity` and named only one of the two data dirs.
- A link sweep over the 145 relative links outside `corpus/` found three more
  dead ones: `docs/discord/rpg/README.md`'s source-layout table named
  `rpg/tick.ts`, `rpg/render.ts` and `rpg/controller.ts`, none of which exist —
  there is no mob-tick or map-rendering module at all, and button routing was
  already listed on its own row. Table corrected against the real files and
  dated.
- **Ingested three decisions that existed only in `docs/`** into
  [decisions.md](wiki/decisions.md): JSON-not-SQLite (because the RPG world must
  be LLM-ingestible in one read), feature-logic-free-of-platform-imports (with
  the deliberate Wordle/TicTacToe duplication as its accepted cost), and the real
  recorded reason for the no-build-step call. A decision documented only in
  `docs/` is a decision that gets relitigated — that was the concrete cost of the
  two layers having no stated relationship.

## [2026-08-27] decision | Code graph installed, then narrowed by its own benchmark

Stood up the §0b *what* layer: `@colbymchenry/codegraph@1.6.0`, installed
**globally** rather than as a devDependency — the payload is ~279 MB of vendored
Node plus a prebuilt per-platform binary, which does not belong in this repo's
lockfile. `.mcp.json` committed (so the layer can't die from a skipped per-dev
step), `.codegraph/` gitignored, `codegraph:init`/`codegraph:sync` scripts added,
telemetry off, native `node:sqlite` backend confirmed.

**Benchmarked before trusting it, and the result narrowed the wiring:**

- `impact loadEnv` → 6 affected files, **identical to grep** (barrel edge through
  `shared/src/index.ts` resolved), at **12.9× less context**. This is the query
  that justifies the layer.
- `callers logger` → 20 of 21 genuine callers. The miss
  (`bots/whatsapp/src/reminders/tick.ts`) uses *identical* import syntax to files
  it found, so the undercount isn't predictable from the source.
- `explore` on a feature → **1.2×** saving (20,950 B vs 25,160 B). Ruled out:
  reading the feature dir is exact and barely larger. This repo is thin
  independent feature dirs, so there's little structure to compress.
- **32 exported names are duplicated** across `bots/discord` and `bots/slack`
  (the deliberate Wordle/TicTacToe/reminders duplication). The graph **unions**
  their callers rather than distinguishing them — a result that looks complete
  and isn't. Never rename off the graph.

Two things the benchmark changed: the MCP server lists only `codegraph_explore`
by default — the worst-measuring query — so `.mcp.json` sets
`CODEGRAPH_MCP_TOOLS=explore,impact,callers,node`; and `CODEGRAPH_NO_DOWNLOAD=1`
disables the shim's GitHub-Releases fallback so only the pinned, registry-fetched
artifact ever runs. Envelope filed at [code-graph.md](wiki/code-graph.md) and
`.claude/skills/codegraph/SKILL.md`; routing rows replaced; MCP handshake
smoke-tested. Todo [closed](todos/add-code-graph-layer.md).

## [2026-08-27] decision | Discord-only: Slack, WhatsApp and dice-activity removed

Deleted `bots/slack`, `bots/whatsapp` and `bots/dice-activity` (~2,700 lines, 60
tracked files) plus `docs/slack/` and `shared/src/bot-adapter.ts`. Workspaces
narrowed to `shared` + `bots/discord`; the `slack:*`, `whatsapp:*` and
`dice-activity:*` scripts and the commented-out pm2 app block are gone. Full
rationale and the non-obvious consequences: [decisions.md](wiki/decisions.md).

Three things the diff does not show:

- **`shared/src/dice-protocol.ts` had to stay.** `bots/discord/src/dicetable/` is
  a WebSocket *client* of the Activity app — `link.ts` connects to its `/engine`
  endpoint and imports `DiceGameWire`/`EngineInbound`/`EngineOutbound`. Deleting
  the Activity did not make the protocol dead code. `/dicetable` is now dormant
  (it answers "not configured" without `DICETABLE_ACTIVITY_URL`), which is a new
  [open question](wiki/open-questions.md), not a break.
- **`bots/dice-activity/.env` was left on disk deliberately.** It holds
  `DISCORD_CLIENT_SECRET`, `SESSION_HMAC_KEY` and `ENGINE_AUTH_TOKEN`, is
  gitignored, and exists nowhere else — deleting it is an irreversible call for
  the user. Its `dist/` (2 MB, regenerable) was removed.
- **A locked decision lost its reason and was formally downgraded.** "Feature
  logic stays free of platform imports" was justified by portability to another
  bot. With no other bot, that reason is void; the decision is kept on the weaker
  basis of readability and explicitly demoted to a convention, per the rule that
  a decision is revisited in the open rather than quietly kept.

Docs swept for the multi-bot framing: `README.md`, `docs/README.md`,
`docs/common/architecture.md` and `docs/common/setup.md` rewritten; the
"cross-bot" wording in `docs/discord/{architecture,setup}.md` corrected. All 121
relative links outside `corpus/` verified. `npm run typecheck` clean.

## [2026-08-27] lint | code-graph envelope re-measured after the trim

Both headline findings from the first benchmark involved files that the trim
deleted, so the recorded envelope was stale and would have misled the next agent.
Re-indexed (1,257 nodes / 3,422 edges, 709 ms) and re-ran the oracles:

- `impact loadEnv` → 3 files, still **exact** vs grep, barrel edge resolved.
- `impact MOB_KINDS` → **6 files where grep finds 3**, and the extra three
  (`rpg-buttons.ts`, `rpg.ts`, `encounter.ts`) never name the symbol but would
  break if it changed. This is the sharper result: `impact` is a correct
  *transitive superset*, which is the thing grep cannot do. 13.5× less context.
- `callers logger` → 11/11. The previously measured undercount is **no longer
  reproducible because the file was deleted, not because the resolver improved** —
  recorded as such, so nobody reads it as "fixed".
- Duplicate names → **12, all inside `bots/discord`** (`applyGuess` is defined in
  both `hangman/game.ts` and `wordle/game.ts`). Was 32 with Slack present, so the
  trim shrank the problem without removing it: the conflation was never purely
  cross-workspace. Still never rename off the graph.
- `explore` → 1.6× (was 1.2×). Still ruled out; read the feature dir.

Updated [code-graph.md](wiki/code-graph.md) and
`.claude/skills/codegraph/SKILL.md`.

Also taught `corpus/lint.sh` two things it needed once history started
accumulating: `log.md` is exempt from the stale-path check (a chronological
record is *supposed* to name deleted paths), and a line carrying
`<!-- stale-ok -->` is skipped, for a page that deliberately cites a deleted path
to explain why a finding is void. Without those, recording this correctly would
have meant either a failing lint or quietly dropping the evidence.
