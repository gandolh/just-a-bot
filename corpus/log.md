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

## [2026-08-27] decision | Open questions grilled: music held, /dicetable and yt-dlp out

Worked the three entries in `wiki/open-questions.md` to a settled state. Two of
them turned out not to be questions: **nothing in the repo runs yt-dlp** (it is
called only inside `if (YOUTUBE_ENABLED)`, which is `false`, inside a feature
whose commands are all commented out), and **Opus passthrough is structurally
incompatible** with the SoundCloud-primary decision, since SoundCloud requires
`skipFFmpeg: false` while passthrough requires the opposite. Both were blocked,
not unanswered.

Settled:

- **Music: active hold, not a closed door.** The user is researching a different
  provider or a cookie-free YouTube route; cookies are ruled out as the standing
  fix. No code moves until a source is proven from the VPS. Recorded in
  [reenable-music.md](todos/reenable-music.md) — which also now flags that the
  cheapest test in that file (does a *fully streamable* SoundCloud track play on
  the VPS?) **has never been run**; every VPS failure so far was measured against
  a 0:30 preview.
- **Blocked ≠ open.** The two music-blocked questions moved out of
  [open-questions.md](wiki/open-questions.md) into the todo that would unblock
  them, and that page now states the rule.
- **`/dicetable` deleted, not shelved** — [brief 02](briefs/done/02-remove-dicetable.md).
  The Activity was added and disabled in the same commit (`0de2132`, 2026-06-03)
  and never ran on the VPS; shelving would preserve code for a revival nobody
  plans. Activities return as a new build, if at all. Takes
  `shared/src/dice-protocol.ts` with it (its only consumers are the two dicetable
  files) and the 92-line Activity-plumbing docs page, deleted knowingly.
- **`shared/` stays a workspace** at 168 lines / 4 files. The package split is
  what makes "no `discord.js` dependency" mechanically enforced rather than a
  convention; collapsing it would touch 14 import sites to buy tidiness.
- **yt-dlp path removed, youtubei kept** — [brief 03](briefs/superseded/03-remove-ytdlp-path.md).
  Removing the *whole* disabled YouTube secondary was recommended and declined.
  The consequence is recorded loudly in
  [decisions.md](wiki/decisions.md) and is the load-bearing line of that brief:
  **flipping `YOUTUBE_ENABLED` back on will no longer produce audio**, because the
  youtubei extractor without the yt-dlp `createStream` override is exactly the
  original 2026-06-26 bug. It also deletes the yt-dlp-through-a-proxy revival
  route.
- **`bots/dice-activity/.env` to be deleted** (in brief 02) — but its
  `DISCORD_CLIENT_SECRET`, `SESSION_HMAC_KEY` and `ENGINE_AUTH_TOKEN` must be
  **rotated, or the Discord app deleted**, in the developer portal. A local file
  delete does not invalidate a live secret. That part is the user's to do.

[revisit-youtube-provider.md](todos/revisit-youtube-provider.md) marked
`superseded` — its premise (re-enabling YouTube is a flag flip) stops being true
once brief 03 lands. No glossary changes were needed: deleting `/dicetable`
collapses the "dormant" state I had been using, leaving *shelved* as the only
term.

Nothing implemented yet — both briefs are in `todo/`.

## [2026-08-27] done | Music subsystem removed entirely — all 8 audio deps gone

Widened scope, same day: rather than removing only the yt-dlp half (the Q8
answer), the user asked to remove **every external library used to play music**.
Executed directly; [brief 03](briefs/superseded/03-remove-ytdlp-path.md) was
superseded before it ever ran.

Removed — 333 lines of code:

- `player.ts` (146), `commands/_music.ts` (26), and the seven commands
  play/skip/pause/resume/stop/queue/nowplaying (161).
- The `initPlayer(client)` call and import in `index.ts`; the commented-out music
  block and its now-false "code is kept intact" comment in `commands/index.ts`.
- `YT_COOKIE` + `YT_COOKIES_FILE` from `env.ts`; `music:update-ytdlp` from the
  root `package.json`; the `docs/discord/music/` page and its index entries.

Removed — 8 dependencies: `discord-player`, `@discord-player/extractor`,
`discord-player-youtubei`, `@discordjs/voice`, `@discordjs/opus`,
`sodium-native`, `ffmpeg-static`, `youtube-dl-exec`. **`npm install` dropped 275
packages.** `bots/discord` is down to six runtime deps. Note `@discordjs/voice`,
`@discordjs/opus` and `sodium-native` had **no direct imports** — they were
declared so discord-player picked up the native builds, which is why grep for
imports alone would have missed them.

Consequence, stated plainly because it reverses a June decision: **music is now
deleted, not shelved.** Reviving it is a rebuild, not an uncomment.
`reenable-music.md` was retitled and rewritten around that, and pins
`git show 4d03ca0:bots/discord/src/player.ts` for the old implementation. The
judgement call: the glue code was worth little (none of it transfers if the answer
is Lavalink) while the *findings* are worth a lot, so [music.md](wiki/music.md)
was converted into a post-mortem and kept — it holds which providers fail from a
datacenter IP and the four settings that each cost real debugging time.

Corpus consequences worked through rather than patched over:

- **`decisions.md` hit the 200-line cap** and was split **by status**:
  live constraints stay, and the music-provider trail (SoundCloud-primary, then
  shelved) moved to [decisions-superseded.md](wiki/decisions-superseded.md). The
  live page is now trustworthy as "everything here still binds". One slip caught
  on review: the first split swept the *live* "removed entirely" decision into the
  superseded page — moved back.
- **`glossary.md`**: *Provider* and *Extractor* described no live code once the
  subsystem went, so they moved to a "Retired terms" note rather than being
  silently deleted or left implying they were current. *Shelved* kept its
  definition and gained the explicit contrast with *removed* — the two were being
  used interchangeably in my own writing, which is exactly the drift the page
  exists to stop.
- **`lint.sh` gained a frozen-records rule.** `log.md` and briefs in
  `done/`/`superseded/` are immutable or historical, so their links to deleted
  code rot by design and can never be fixed — linting them produced 8 unactionable
  failures. Code links from those files are now exempt; their corpus-internal
  links are still checked, which is what caught the `briefs/todo/03` →
  `briefs/superseded/03` path after the move.

`docs/` swept (115 links verified, 0 broken); typecheck clean; corpus lint clean.

## [2026-08-27] done | Brief 02 — /dicetable removed (via plan-split-dispatch)

Ran brief 02 through the orchestrator at the user's request. Worth recording that
the tool was a poor fit and I said so up front: the backlog held **one** brief and
it decomposed into two mechanical deletion chunks, below the skill's own "≥3
independent chunks" threshold. Approved anyway; it worked, but the coordination
cost exceeded the work, as predicted.

**Dispatch:** two junior (sonnet) chunks — code deletion, and docs + leftover
directory — with the corpus closeout kept by the controller. Both returned DONE
first try; no escalations, no re-dispatches.

**Shipped:** the feature, its command, the three `DICE_ACTIVITY*`/`DICETABLE_*`
env vars, the shared dice wire protocol, `docs/discord/dicetable/`, the leftover
`bots/dice-activity/` (including its gitignored `.env`), and `ws` + `@types/ws` as
direct dependencies. 24 files, 100 insertions, 721 deletions. Full outcome note on
the [brief](briefs/done/02-remove-dicetable.md).

**Review gate — two scoped finders (sonnet), and the second earned its keep:**

- Finder 1 (over/under-deletion, wiring): **no findings**. Confirmed all 20
  surviving commands still registered, and that the `customId` button router never
  referenced dicetable, so there was no dead branch to leave behind.
- Finder 2 (residual references, doc truth): **one Critical**, and it was a real
  miss — `bots/discord/.env.example` still documented all three deleted env vars
  as enabling `/dicetable`. Nothing in the brief mentioned that file and the
  controller did not know it existed, so no chunk owned it. An operator following
  `docs/discord/setup.md` would have configured a feature that no longer exists.
  Fixed inline.

**Two gaps in the controller's own plan**, both caught by subagents rather than by
me — the honest lesson from this run:

1. `docs/common/{setup,architecture}.md` described the dice wire protocol as
   living in `shared/`. Outside both chunks' file lists; surfaced by chunk 2's
   out-of-scope sweep.
2. `.env.example` above. A brief that enumerates "Files you OWN" is only as good
   as the controller's inventory, and grepping for the *feature name* would have
   found both. Next brief that deletes a feature: sweep for the feature name
   across the whole repo *before* drawing chunk boundaries, not after.

**Also fixed:** `decisions.md`'s no-build-step entry still named
`bots/dice-activity` as the deliberate exception that builds. Nothing builds now.

**Accepted, not fixed:**

- `package-lock.json` carries phantom workspace entries for `bots/dice-activity`,
  `bots/slack` and `bots/whatsapp`. Pre-existing (from the workspace removal, not
  this change) and npm marks them extraneous. Neither `npm install` nor
  `npm install --package-lock-only` prunes them; only deleting and regenerating
  the lockfile would, which risks version drift across 65 packages for a cosmetic
  gain. Left deliberately.
- `.env.example` does **not** document `IG_USER_ID` / `IG_ACCESS_TOKEN`, which
  `env.ts` declares for `/post`. Pre-existing and unrelated to this brief — the
  same class of bug as the Critical above, so worth a follow-up, but fixing it
  here would be scope creep.

**Rulings**

- [tool choice] orchestrator used on a 2-chunk backlog against the skill's own
  guardrail — user's explicit call, flagged before dispatch.
- [chunk 2] the irreversible `.env` deletion was dispatched rather than kept by the
  controller; the prompt forbade printing or copying its contents.
- [finding: lockfile phantoms] rejected as accepted-not-fixed — pre-existing,
  cosmetic, and the fix is riskier than the defect.
- [closeout] code graph re-synced; the duplicate-name list in
  [code-graph.md](wiki/code-graph.md) and the project skill went 12 → 9, since
  `createGame`/`loadGame`/`updateGame` lived in `dicetable/store.ts`.

The brief backlog is now **empty**: 01 and 02 done, 03 superseded.

## [2026-08-27] lint | Two hidden commands found undocumented; env parity fixed

Swept for genuinely incomplete work rather than trusting the running list. Three
findings, all pre-existing.

**1. `/dnd` and `/post` are hidden, and nothing said so.** Both are commented out
of `commands/index.ts` — `/dnd` in `0e41efc` ("save"), `/post` in `732889c`
("comment post for now") — while four places claimed they worked:
`wiki/overview.md`, `wiki/status.md`, and `docs/discord/README.md` in three spots
(intro + two feature-index entries), plus two full feature manuals with no
notice. Anyone reading either layer would have gone looking for a command that
isn't registered.

Corrected the false claims, which is safe without knowing the reason: banners on
`docs/discord/{dnd,post}/README.md`, **hidden** markers in the feature index, and
honest wording in `overview.md` / `status.md` / `architecture.md` (the `dnd/` and
`instagram/` dirs are live code backing unregistered commands).

**What I did not do is invent the reason.** Neither commit message explains the
hide, so the *intent* is genuinely unknown — temporary, shelved, or abandoned —
and those three lead to different actions (leave / record a decision / delete, as
`/dicetable` was). Filed as the one entry in
[open-questions.md](wiki/open-questions.md). This is the `decisions.md`
"undefended decision" problem in a different place: a choice was made in code with
no recorded why, so nobody can revisit it intelligently — only obey or break it.

**2. `.env.example` ↔ `env.ts` parity.** `IG_USER_ID` and `IG_ACCESS_TOKEN` were
declared in the schema but undocumented — the same class of bug as the `/dicetable`
Critical the review finder caught, just for a different feature. Added, with a note
that `/post` is currently hidden so setting them alone will not surface it.
Schema and example now match exactly, verified by diffing both key sets.

**3. `briefs/todo/` disappeared.** `git mv`-ing brief 02 into `done/` emptied the
directory, and git does not track empty directories — so the corpus skeleton lost
a required dir and `index.md`'s link to it broke. Caught by `lint.sh`, not by me.
Restored with a `.gitkeep` that explains why it exists, so the next closeout does
not silently repeat it.

Sweeps that came back clean: no `TODO`/`FIXME`/`HACK`/`XXX` anywhere in `bots/` or
`shared/`, no leftover `@deprecated`, no corpus `TODO` stubs.

## [2026-09-06] done | A documentation site at `/just-a-bot/docs`, rendering both doc trees

`docs-site/` — Astro + Starlight, built by `npm run docs -w @bots/docs-site`,
deployed at the estate's `/<project>/docs` convention.

**Two rendered source trees, which is the whole design of this one.** The repo
already had 21 hand-written pages under `docs/` — the user-facing manual, what
each command does — alongside 9 corpus wiki pages, the maintainer's synthesis of
why the repo is shaped this way. Neither restates the other, so the sync script
does two passes and the site keeps them in separate sections: `/manual/…` and
`/wiki/…`. A folder's `README.md` becomes the page for that folder rather than an
`/index/` nobody links to.

The site lives in **`docs-site/`, not `docs/`**, precisely because `docs/` was
already taken by real content. The deployed URL is unaffected — that comes from
the estate's `DocsSite` construct, not from the directory name.

**No design system to inherit, so one was derived rather than defaulted to.**
This is a Discord bot: no web UI, no palette, nothing to match. The direction is
a **command transcript** — dark ground, a terminal-green accent used as a prompt
rule at each section head, and JetBrains Mono carrying structure rather than only
code, because in this system a command name (`/trivia`, `/rpg`) is an identifier
and setting it in prose type would make it look like a word. Deliberately **not**
Discord's blurple and greys: a docs site dressed as the host application implies
an affiliation that does not exist, and this is emphatically a personal bot.

**One archify diagram** — one gateway, many features, one shared package. Its
cards carry the three things a new reader gets wrong: a feature owns its own
commands and state, `shared/` is defined by what it may *not* depend on, and the
D&D layer and `/post` are built-but-hidden rather than broken.

**A first for the estate's deploy:** this stack had no Caddy route at all — the
bot binds nothing and opens an outbound gateway connection — so adding docs made
it a routed stack, and it needed a `CaddyInstall` to actually ship its block.
`/just-a-bot/docs` is now the only thing under that prefix, with no app route
above it to be shadowed by.

Typecheck clean, corpus lint clean. `docs-site` added to the root `workspaces`
array.

## [2026-09-26] todo | Improvements audit: 16 briefs filed (04-19)

A read-only survey of the whole repo using the `improve` skill: recon from the
corpus, five parallel finders (correctness on opus; security, performance,
debt/coverage and docs drift on sonnet), and a dependencies pass done inline.
Every finding kept below was checked again against the cited lines before it
was believed.

**Scope.** Read `bots/discord/src`, `shared/src`, `infrastructure/`,
`.dockerignore`, `ecosystem.config.cjs`, `corpus/` and `docs/`. Skipped
`node_modules`, `docs-site/src/content` (generated), fonts and the lockfile.

**Numbers.** 51 raw findings became 17 kept items after merging duplicates (16
briefs, since the unused voice intent folds into 04). Another 10 are parked on
Watch below, and 2 were dropped: the Docker `npm ci` concern was disproved by
simulating the deps stage (59 packages, docs-site deps pruned), and the RPG
crier moving to the latest `/rpg start` channel is by design (comment at
`commands/rpg.ts:101`). Before reporting, the finders also dropped wallet
double-click races (a window of about 1 ms) and RPG duel logs over 2000
characters (about 0.5% in simulation).

**Reproduced during vetting, not just read.** The crash path depends on
discord.js's `captureRejections: true` (`BaseClient.js:16`). The `/clock` offset
bug was reproduced under `TZ=UTC` and `TZ=Europe/Bucharest`. The trade dupe is
reachable because `doSell` never consults open trades.

**Filed, in rank order.** See [status.md](wiki/status.md) "Queued work" for the
one-line catalog and the file-overlap sequencing.

- Now: 04 crash guard, 05 allowedMentions default, 06 Connect Four per-turn
  timer, 07 container state volumes (needs the user to say whether pm2 or Docker
  is live), 08 RPG trade dupe, 09 clock offset, 10 discord.js 14.27.0 + audit,
  11 docs/ drift, 12 corpus drift, 13 RPG combat gating, 14 trivia timeout,
  15 reminder length, 16 hangman word.
- Next: 17 mafia phase timers, 18 crash-safe JSON persistence, 19 `node:test`
  suite.

**Watch.** Named, not specced. Revisit when the trigger in each line happens.

- In-memory game maps (blackjack, blackjack2, dice2, tic-tac-toe, wordle,
  hangman) never evict abandoned games. Negligible at one guild, and every
  restart clears them.
- dice2 and blackjack2 hold a debited ante with no timeout or challenger cancel,
  and a restart loses it. These are free-mint wallet coins (`/coins add`), so
  the stakes are low.
- `World.duels` and `World.trades` are never pruned. The local world file is
  4 KB. Act if it grows enough to threaten the "one LLM read" reason in
  decisions.md.
- `updateWorld` mutates the cached world in place, so a throw mid-switch in
  `rpg-buttons.ts` leaves partial state that the next flush persists.
- `commands/rpg-buttons.ts` is 858 lines. Split it by domain (create, duel,
  trade, controller) the next time it's touched.
- The customId `if/else` router in `index.ts` silently ignores unknown prefixes.
  Add a `log.warn` fallback the next time it's touched.
- `/ask` and `/img` have no per-user cooldown, and `/ask`'s `model` option lets
  any member pick any model on the paid Ollama key.
- Absolute reminder times are UTC, the same documented v1 choice as birthdays.
  Honoring the user's `/clock` zone would be a v2 feature.
- `reminders/tick.ts:23-26` deletes a reminder on any send failure, including a
  transient Discord outage.
- Nothing about `/dnd` or `/post` code. Their fate is still the open question
  in open-questions.md.

## [2026-09-26] todo | Second improvements pass: 5 briefs filed (20-24), 07 and 17 amended

A second run of the `improve` skill, started in parallel with the first. The
first pass filed 04-19 while this one was auditing, so every finding here was
vetted against those briefs and the first pass's Watch list, not only against
the code. Five finders (correctness on opus; security, performance, debt and
deps/DX on sonnet) returned 49 findings, plus 4 leads from recon. Six items
survived as new work: five briefs and an addendum to 17. A second addendum, to
07, carries the estate evidence behind brief 20.

**What the first pass couldn't see.** It never read `../vps-deploy`. That repo
deploys this bot as a container only since `8bec566` (2026-09-06). Its cutover
script calls the bot "stateless" and took no backup. Its rsync excludes
`bots/*/data` but not `bots/data`. A simulation with the exact flags deleted a
server-only file under `bots/data/` and replaced `reminders.json` with the local
copy. So brief 07's default mount path would be rewritten on every deploy, and
07's step 4 would overwrite the pm2-era state still on the host. Brief 20 fixes
the estate side, and 07 now has an addendum telling the executor to read 20
first.

**Reproduced, not just read.**
- A Docker build against the real `.dockerignore` ships `/app/bots/data/birthdays.json`
  (222 bytes of dev data) and no `/app/bots/discord/data`.
- A finder claimed `docker stop` never reaches the bot through
  `npm -> sh -> npm -> sh -> tsx -> node`. That holds with dash, but in the real
  `node:24-alpine` image busybox `sh` execs the command, the chain is
  `npm -> npm -> tsx -> node`, and the bot's SIGTERM handler ran (exit 0).
  Dropped, so brief 18's shutdown flush will work in the container.
- Node 24 turns `2026-02-30` into March 2 (brief 24).
- A diff of registered builders against `/help` found 7 dead and 11 missing
  commands (brief 21).

**Filed:** 20 estate state protection, 23 `/quote add` channel permission,
21 `/help` from the registry, 22 docs for `/c4`, `/c42`, Wordle and
tic-tac-toe, 24 impossible dates. Also 17 part (d): `launchGame` has the same
unclaimed-transition race, giving double role assignment and role-less joins.

**Dropped.**
- About 30 findings duplicated briefs 04-19.
- Five were already on the first pass's Watch list: map leaks, dice2 and
  blackjack2 antes, duel and trade pruning, the router, and `rpg-buttons.ts` size.
- Two were disproved by test: the Docker SIGTERM chain and `npm ci` without
  `docs-site`.
- Four are by design or documented: the `/coins add` faucet, the trivia
  fallback, tsx as a devDependency in the image, and `@types/node` tracking the
  engines floor.
- The rest were too small or had no live bug: `statsFor`, the `reminders/parse.ts`
  re-export, mafia's dynamic imports, RPG action strings, `register.ts` error
  text, and the wallet double-click races (a window of milliseconds on free
  coins).

**Watch** (named, not specced):
- SIGTERM reaches the bot only because busybox `sh` execs. Moving the image to a
  Debian base, where `sh` is dash, would break graceful shutdown silently.
  Switch the CMD to `node --import tsx` if the base ever changes.
- `npm run typecheck` skips `shared` and `docs-site`, which have no typecheck
  script. `shared` is covered today only because `bots/discord` imports all of it.
- `ephemeral: true` appears 137 times and is deprecated. Migrate it with any
  discord.js v15 upgrade.
- A mafia game with more than 25 alive players overflows 5 button rows, and the
  DM try/catch swallows the error.
- `tickReminders` has no overlap guard. A tick longer than 60 s during a Discord
  outage re-sends due reminders.
- Every store's cold load can race: two first callers after a restart each parse
  their own copy, and the last one wins.
- A stale Town screen lets a player buy and sell away from the Plaza. Brief 13's
  guard covers fights only.

## [2026-10-02] done | Brief 04: a failed reply inside a listener no longer kills the bot

The mention echo is deleted, `Events.Error` is logged on the client, a
module-level `unhandledRejection` handler logs instead of crashing, and the
`GuildVoiceStates` intent is gone. There is deliberately no `uncaughtException`
handler. The MessageCreate listener now only routes Wordle and Hangman thread
messages.

Full outcome on [the brief](briefs/done/04-crash-guard-event-listeners.md).
