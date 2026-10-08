# Log

Chronological record of meaningful corpus + project changes. Newest last.

## [2026-06-26] maintenance | corpus bootstrapped

Created `corpus/` at repo root: CLAUDE.md, index.md, log.md, routing.md, and
the wiki spine (overview, architecture, decisions, status, open-questions) plus
a music concept page. Seeded from the repo structure and the
in-flight music work.

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
  music.md described the providers as active without saying the
  commands are commented out — now banner-flagged as shelved.

Deliberately **not** done: the code-graph layer (§0b) needs a pinned dependency
and a committed `.mcp.json`, which is a repo change rather than a doc update —
filed as todo with the case for and against.
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
smoke-tested. Todo closed.

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
  reenable-music.md — which also now flags that the
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
- **yt-dlp path removed, youtubei kept** — brief 03.
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

revisit-youtube-provider.md marked
`superseded` — its premise (re-enabling YouTube is a flag flip) stops being true
once brief 03 lands. No glossary changes were needed: deleting `/dicetable`
collapses the "dormant" state I had been using, leaving *shelved* as the only
term.

Nothing implemented yet — both briefs are in `todo/`.

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

## [2026-10-02] done | Brief 05: user text can no longer ping @everyone or roles

`allowedMentions: { parse: ['users'], repliedUser: true }` is now the client
default, as specified. It covers every sink the brief lists: reminders, `/ask`,
the RPG duel proposal and the town crier. `give.ts`'s per-message override is
untouched.

Full outcome on [the brief](briefs/done/05-default-allowed-mentions.md).

## [2026-10-02] done | Brief 06: the Connect Four timer is per turn

The forfeit body moved into `armTurnTimer(messageId, match, message)`, which
clears the previous handle before arming a fresh 90 s timer. `startMatch` calls
it once the board is posted, and the placeholder `setTimeout(() => {}, 0)` is
gone. `handleConnectFourButton` re-arms it after every move (after the bot's
reply move in solo mode) unless the game finished. `finalize` is unchanged.
`Match.timeoutHandle` became optional, since there is no timer before the first
board.

Full outcome on [the brief](briefs/done/06-connect-four-per-turn-timer.md).

## [2026-10-02] done | Brief 08: executeTrade counts copies (hardening; the UI could not reach the dupe)

`executeTrade` now counts. `missingItem` builds a `Map<item, offeredCount>` per
side and fails with the existing `${name} no longer has ${item}.` when an
inventory holds fewer copies than offered. `moveItems` gives the receiver a copy
only when the giver's splice removed one. Coins are untouched.

Full outcome on [the brief](briefs/done/08-rpg-trade-item-dupe.md).

## [2026-10-02] done | Brief 09: /clock prints each zone's own UTC offset

`formatLocalTime`'s offset block is replaced by `getUtcOffsetMinutes(tz)`, with
the formatting unchanged.

Full outcome on [the brief](briefs/done/09-clock-utc-offset.md).

## [2026-10-02] done | Brief 10: discord.js 14.27.0, a pinned renderer, a clean audit

discord.js is pinned at 14.27.0, and the `/img` renderer is pinned exactly:
satori 0.26.0 and @resvg/resvg-js 2.6.2, the versions already installed. After
`npm install` and `npm audit fix` (no `--force`), both `npm audit` and
`npm audit --omit=dev` report **0 vulnerabilities**. The 14.27.0 release notes
list no breaking changes or deprecations touching reply options
(`ephemeral`/`flags`), `withResponse`, `deferReply`, `followUp`, `editReply` or
`allowedMentions`. The one relevant fix makes `update()`'s options optional.

Full outcome on [the brief](briefs/done/10-bump-discordjs-and-audit.md).

## [2026-10-02] done | Brief 11: the docs pages that contradicted the code are fixed

All five fixed against the code. `docs/discord/setup.md` names `CLIENT_ID` and
`GUILD_ID` and points at `.env.example`. The gambling table and the feature index
gain `/blackjack2` (two players, shared dealer, each hand settled against the
dealer), `/dice2` (both ante, the higher 2d6 takes the pot, a tie refunds) and
`/give`, which was listed nowhere. `/post` reads 256×256 in all three places, and
its page states plainly that 256 is below Instagram's 320 px minimum; no code
was changed. The img page's "Cross-feature hooks" now says `/top` and `/quote`
shipped text-only and drops the two dead `docs/todo/` links.
`docs/common/setup.md` lists three workspaces, the docs build command and a
`docs-site/` layout row.

Full outcome on [the brief](briefs/done/11-docs-drift.md).

## [2026-10-02] done | Brief 12: corpus and CLAUDE.md drift removed

All five items fixed:
- `architecture.md` drops the player (bootstrap line, dependency direction) and
  the dice-table wire protocol. It justifies `shared/` by the
  no-`discord.js` boundary and lists `docs-site/` and `infrastructure/` in the
  layout.
- "Two workspaces" is gone from the root `CLAUDE.md`, `architecture.md` and
  `overview.md`.
- The yt-dlp maintenance note is deleted from `status.md`.
- "Nothing builds" is scoped to the bot in `CLAUDE.md`, `architecture.md` and
  the `decisions.md` "No build step" entry, each naming `docs-site`'s
  `astro build` as the one build. The decision is not reopened.
- `status.md` is dated 2026-10-02, and its Tooling section gains the docs site
  and the container image, pointing at briefs 07 and 20 for the deploy path.

Full outcome on [the brief](briefs/done/12-corpus-drift.md).

## [2026-10-02] done | Brief 13: an older RPG controller can't act mid-fight

`handleControllerButton` now guards before the action switch. With
`char.encounter` set, any action other than `fight`, `flee` or `combatpotion`
(`screen` included) sets the combat screen and the banner "You're in a fight!
Attack, flee, or drink a potion." and returns from the mutate callback. `rpg/*.ts`
and the duel and trade handlers are untouched.

Full outcome on [the brief](briefs/done/13-rpg-block-actions-in-combat.md).

## [2026-10-02] done | Brief 14: the trivia fetch times out into the fallback bank

The OpenTDB fetch now passes `signal: AbortSignal.timeout(5_000)`. The abort
rejects into the existing catch, which returns `fromFallback(...)`. Nothing else
changed.

Full outcome on [the brief](briefs/done/14-trivia-fetch-timeout.md).

## [2026-10-02] done | Brief 16: "jalapeño" is now a winnable hangman word

`'jalapeño'` is now `'jalapeno'`. The acceptance grep prints nothing: every
hangman word matches `^[a-z]+$`. Brief 19 hasn't landed, so the guard test is

Full outcome on [the brief](briefs/done/16-hangman-jalapeno.md).

## [2026-10-02] done | Brief 15: long reminders are delivered truncated; the list stays usable (register needed in prod)

The `text` option has `.setMaxLength(1000)`. `tick.ts` builds the message with
an exported `reminderMessage`, which truncates with an ellipsis so the delivered
message is at most 2000 characters, covering reminders stored before the cap.
`handleList` clips each text to 80 characters, stops adding lines before 1900,
and appends "…and N more" when it cut the list.

Full outcome on [the brief](briefs/done/15-reminder-text-length.md).

## [2026-10-02] done | Brief 17: Mafia phases resolve once, timers belong to their game, restarts re-arm

All four parts done, with a scratch harness around a stubbed client (exactly
`users.fetch().send` and `channels.fetch()` → `isSendable`/`send`) on throwaway
`harness-*` guild files, deleted afterwards.

Full outcome on [the brief](briefs/done/17-mafia-phase-timers.md).

## [2026-10-02] done | Brief 18: atomic JSON writes, a recovering write chain, a flushed shutdown

`shared/src/json-file.ts` (exported from `@bots/shared`, no `discord.js`)
provides `writeJsonFile(file, json)` and `flushPendingWrites()`.
- Writes are atomic: `<file>.<pid>.tmp`, fsync, `rename`.
- Each path has one chain that runs every write after the previous one
  settles, so a failed write rejects only for its own caller.
- A registry of in-flight chains backs the flush.

Full outcome on [the brief](briefs/done/18-crash-safe-json-persistence.md).

## [2026-10-02] done | Brief 19: a node:test suite for the pure game logic

`npm test` runs `node --import tsx --test "src/**/*.test.ts"` in `bots/discord`
and `shared`, via `npm run test --workspaces --if-present` at the root. There
are no new dependencies. 24 tests, about 0.7 s for the whole run.
- **Blackjack:** ace demotion ({A,A,9}, {A,A,A,8}), soft hands, and
  `isBlackjack` (a two-card 21 only).
- **Wordle:** duplicate Es against targets with 0, 1 and 2 Es, with exact
  expected marks.
- **Connect Four, through `dropDisc`:** a win in each of the four directions
  (the two diagonals were checked to win on a diagonal), a gapped near-win, a
  42-move full-board draw, and the full-column and finished-game refusals.
- **Reminder parsing:** `parseDuration` for every unit, "tomorrow 12am/12pm"
  as 00:00/12:00 UTC, the ISO branch and `parseWhen`.
- **Trades:** item and coin conservation, plus the brief 08 multi-copy case,
  which has landed, so it is a real test and not a todo.
- **Hangman:** every word matches `^[a-z]+$`.
- **Beyond the targets:** `reminderMessage` truncation (brief 15).

Full outcome on [the brief](briefs/done/19-node-test-suite.md).

## [2026-10-02] done | Brief 21: /help is built from the registered commands

`/help` is built from the registry. `commands/index.ts` calls
`setHelpCatalog(all, allContextMenus)`, and `help.ts` maps command names to
groups:
- Gambling (with `give`) and Games (with `mafia`, `hangman`, `trivia`)
- RPG, which keeps its hand-written text
- Social: `quote`, `confess`, `birthday`, `remindme`, `clock` and the Save
  Quote menu
- AI and images (`ask`, `img`), Leaderboards (`top`) and Misc
- Other, a catch-all for anything unmapped

Full outcome on [the brief](briefs/done/21-help-from-registry.md).

## [2026-10-02] done | Brief 22: /c4 vs /c42 documented correctly; Wordle and tic-tac-toe pages

The Connect Four page now splits `/c4` (solo, you are Red, the bot answers in
the same press) from `/c42 opponent` (challenge; not yourself, not a bot). It
describes the bot from `ai.ts`: six-ply minimax with alpha-beta, centre-out
move order, open-line scoring that blocks threes hard. It also states the
per-turn timer that brief 06 made true. New pages: Wordle (thread start,
anyone guesses, letters-only and in-list validation, repeated-letter marking,
the `delete` rule and its Manage Threads need, about 480 words serving as both
targets and accepted guesses, in-memory state) and tic-tac-toe (optional
`opponent`, ❌ moves first, the perfect-minimax bot with random tie-breaks, a
highlighted winning line, no timeout so an abandoned game lives until a
restart). Both are in the feature index.

Full outcome on [the brief](briefs/done/22-docs-games-pages.md).

## [2026-10-02] done | Brief 23: /quote add only saves messages the invoker can read

`handleAdd` now checks the invoker's access after fetching the channel and
before fetching the message: `channel.permissionsFor(interaction.user.id)` must
include both `ViewChannel` and `ReadMessageHistory`. A missing channel, a DM
channel, a non-text channel, a null permission result (member not cached, so
it fails closed) and missing permissions all get the same ephemeral reply,
"You can't quote from a channel you can't read.", so the check doesn't confirm
a hidden channel exists. The store and display commands are untouched, and
quotes saved earlier stay.

Full outcome on [the brief](briefs/done/23-quote-add-channel-permission.md).

## [2026-10-02] done | Brief 24: /birthday and /remindme refuse impossible dates

`parseDate` (birthday) rejects a day past the month's length, with February
allowing 29. The ISO branch of `parseAbsolute` builds the `Date` and returns
`null` unless its UTC year, month and day equal the parsed ones, so the user
gets the existing "Could not parse that time" reply.

Full outcome on [the brief](briefs/done/24-reject-impossible-dates.md).

## [2026-10-02] status | 19 of the 21 audit briefs done; 07 and 20 wait on the owner

Briefs 04-06, 08-19 and 21-24 shipped in one run, one commit each. 04-06 landed
on `main` before the repo's "branch first" rule was noticed; the rest are on
`audit-briefs-2026-09-26`. Moving `main` back was blocked as a destructive git
operation, so that is the owner's call. No dev application token was available,
so every check that needs the live bot is named as owed in its brief's outcome.
Production needs `npm run discord:register` after the next deploy (brief 15
changed `/remindme`'s schema). Captured along the way:
hangman-give-up-docs.

## [2026-10-04] decide | Briefs 07 and 20: the owner runs the server steps

Asked how to get the live server's state, the owner chose to run the checks themselves: the agent writes the exact commands (brief 20 steps 1 and 4), the owner runs them on the VPS, pastes the output, and picks which copy of each state file survives. Recorded in decisions.md. No deploy until then.

## [2026-10-04] decision | Production is the container; the bot's state moves out of the mirror (briefs 07 and 20, repo side)

The pm2 entry in decisions.md is revisited: production runs the container through the estate's deploy, `docker compose logs` replaces `pm2 logs` there, and pm2 stays for local runs. Repo side of brief 07: compose bind-mounts `bots/data` and `bots/discord/data` (env-overridable), and `.dockerignore` keeps `bots/data` out of the image (checked: a fresh image has no `/app/bots/data`). Brief 20's side is in `../vps-deploy` (`4acca94`): state under `/srv/just-a-bot/state`, `bots/data` excluded from the rsync, and the cutover script backs both old directories up. An rsync simulation with the exact flags keeps every server-only file. **Not deployed.** The owner runs brief 20's steps 1 and 4 on the VPS and picks which copy of each state file survives.

## [2026-10-06] done | Hangman docs drop `/hangman give-up`

The todo asked whether `give-up` was dropped or never built. It was dropped:
`f67bb0d` (2026-06-02) removed the subcommand along with its starter-or-admin
check. `docs/discord/hangman/README.md` now documents only `/hangman start`, and
says a game ends on a win or the sixth wrong guess. Todo `hangman-give-up-docs`
is done.


## [2026-10-06] decision | `/dnd` and `/post` deleted

The owner answered the last open question: both hidden commands go, the way
`/dicetable` went. Deleted the commands, `dnd/` (including an orphaned
`dice.ts`), `instagram/`, the `meme-square`/`card-square` templates, the `ig:`
button route in `index.ts` (still wired to the hidden command), the `IG_*` env
vars, both docs pages and the diagram's Instagram node. Also dropped a stale
`player.ts` line from the architecture page; music took that file on 2026-08-27.
Recorded in decisions-removals.md (split out of decisions.md, which hit the page cap).

## [2026-10-07] decision | The old music approach is purged; music will be rebuilt in-house from zero

The owner asked to purge everything about the old music approach: playback
through third-party sources (YouTube, yt-dlp, SoundCloud) and their extractors.
The code and all eight audio dependencies were already gone (2026-08-27; no
audio package is installed). Deleted now: the post-mortem (`wiki/music.md`), the
research todo (`reenable-music`), the superseded provider decisions
(`wiki/decisions-superseded.md`, music-only), briefs 01 and 03, the music-only
log entries from 2026-06-26 and 2026-08-27, the docs-site pages and sidebar
links for them, and the `/play` guard in `help.test.ts`. decisions.md now holds
one entry: no music, and a future feature starts from zero. The owner's new idea
(in-house, on-demand loading or downloaded files) is captured as
`music-in-house` (retired the same day). Tests 27/27, typecheck clean, lint clean.

## [2026-10-07] maintenance | Briefs 07 and 20: state is purged, not reconciled; the deploy is the owner's

The owner chose to purge the bot's state and start fresh. A read-only check of
the VPS that day: `infrastructure-just-a-bot-1` up 4 weeks, no pm2 process, no
pm2-era `bots/discord/data` on the host, no `/app/bots/discord/data` in the
container. The only state is `bots/data/{reminders,birthdays}.json` (12 KB) on the
host and in the container. `node cli.ts just-a-bot server --dry-run` shows empty
`state/shared` and `state/discord`, the new excludes, a rebuild and `up -d`. The
real deploy was blocked for the agent as a production action, so the owner runs
it, then deletes `/srv/just-a-bot/bots/data`. Both briefs carry the steps.

## [2026-10-07] done | Briefs 07 and 20 deployed; the bot starts with fresh state

The owner ran `node cli.ts just-a-bot server` and deleted
`/srv/just-a-bot/bots/data`. Read-only check afterwards: the container runs the
new image and logs in as the bot; `/app/bots/data` and `/app/bots/discord/data`
are bind-mounted from `/srv/just-a-bot/state/shared` and `/state/discord`, both
empty; the old host `bots/data` is gone. Both briefs moved to `done/`. The
Discord `/coins` survival check is left to the owner. Also from the owner today:
committing straight to `main` is allowed (root CLAUDE.md), and the music-purge
branch is merged into main and deleted.

## [2026-10-07] maintenance | Music todo retired

The owner will write the music brief when it is time, so the placeholder todo
`music-in-house` is deleted (git has it). decisions.md still records that the old
third-party approach is gone and an in-house design is planned; status.md,
open-questions.md and routing.md now say so without linking a todo.

## [2026-10-08] decision | Music comes from atrium: the Jukebox

Grilled with the owner across two rounds, together with atrium. The bot plays
only Tracks from atrium's music library, signed in as its own Ward account,
whose `jukebox` grant atrium enforces as an allowlist (atrium D55). Atrium owns
every Player, the Playlist is atrium's whole music library, and each Player has
a Queue (atrium D56 and D57). The bot keeps no Player state, long-polls atrium
for commands and still binds no port. Anyone in the guild may control it, all
commands sit under `/jukebox`, and the bot posts nothing on its own. Audio
streams from atrium, converted to Ogg Opus by ffmpeg, with the next two Tracks
buffered in a temp directory, following the discord.js voice guide. DAVE has
been mandatory since 2026-03-01. Recorded in decisions.md, and the Jukebox terms
are in glossary.md.

## [2026-10-08] todo | Briefs 25-27: the Jukebox

Filed from that session: 25 signs in to atrium (Ward login without a browser,
saved refresh token, lockout-safe retries), 26 plays audio and runs the
long-poll link, 27 adds `/jukebox` and its docs. They depend on atrium briefs 80
and 81. open-questions.md, routing.md and status.md no longer say the owner will
file the music brief later.


## [2026-10-09] done | Brief 25 — the Jukebox signs in to atrium

`jukebox/atrium/` signs in to Ward as the Bot account without a browser, saves
the refresh token before using what it bought, refreshes two minutes early and
single-flight, and tries a refused password once only. `npm run
discord:jukebox-check` passed against the local Ward and atrium: login, refresh,
`/health` 200, `/library` 403 `JUKEBOX_ROLE_FORBIDDEN`, and a second run resumed
without a login. The production check is the owner's.
