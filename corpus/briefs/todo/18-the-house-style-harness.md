# Task 18: The house style and the quality harness

**Depends on:**

- In just-a-bot: nothing. This is the only open brief. There is no Base UI, Tailwind, server or redesign brief here (see Interplay).
- In the owner's skills library:
  - brief 27, *A house style, and a quality harness that enforces it*: the vendored `house-style` copy at its first version, the `house-style` skill, and the plugin's `Stop` and `PostToolUse` hooks;
  - brief 15, *Enforce the base-ui and code-structure skills in every repo*: only for how the harness is wired. Neither convention checker applies here.
- The owner's grilling of 2026-11-10: the skills library's open questions Q5-Q14, Q45-Q51.

**Runs before:** nothing in this repo.

**Before you start:** run `brief-board guide` ([CLAUDE.md](../../CLAUDE.md), "brief-board").

**Safety rule for this whole brief.** `bots/discord/.env` holds production values. Never read, copy, edit or print it. Never start the bot, never run `npm run discord:register`, `discord:dev`, `discord:start` or `discord:jukebox-check`, and never run `npm test` in this checkout. `bots/discord/src/env.ts` loads that file when any module imports it, and `help.test.ts` and `jukebox.test.ts` import it. Everything below that executes code runs on a scratch copy made without `.env` files, or is Prettier, `tsc --noEmit` or ESLint, which load no application code.

## Context

On 2026-11-09 the owner asked for the researched conventions to be enforced in every repo, keeping the house style. The skills library measured that style and found it consistent but unenforced. This repo is a Discord bot with two workspaces (`shared`, `bots/discord`) and a Docusaurus docs site (`docs-site`). The owner's scope for the web-UI calls (Base UI, Tailwind, a redesign) covers web apps. The only web UI here is the docs site, which is out of scope. So this brief is the harness only.

What makes this repo different from the lineage the harness was drawn from:

- **No build step.** `tsx` runs the TypeScript directly in dev and in the container ([decisions.md](../../wiki/decisions.md), "No build step"). Relative imports carry `.ts` suffixes (`allowImportingTsExtensions`, `noEmit`), not the lineage's `.js`. That stays.
- **Tests are zero-dependency `node:test` files** next to the code (`node --import tsx --test "src/**/*.test.ts"`). Nothing is vitest.
- **There is no hosted CI** and none is added. The gate is local.
- **The tests read production's `.env`.** That decides how `check` runs them (step 5).

### What the repo has today (read 2026-11-10)

- **TypeScript versions are mixed.** `package.json` (root devDependencies) pins `typescript` 5.7.3, and `docs-site/package.json:36` has `~6.0.2` (installed 6.0.3, `docs-site/node_modules/typescript/package.json`). `erasableSyntaxOnly` needs 5.8 or newer, so the alignment comes first. On a scratch copy, `tsc --noEmit -p shared` and `-p bots/discord` pass with 5.7.3 and with 6.0.3, no flags.
- **`tsconfig.base.json`** has `strict`, `module` and `moduleResolution` `NodeNext`, `target` `ES2022`, `lib` `ES2023`, `esModuleInterop`, `skipLibCheck`, `forceConsistentCasingInFileNames`, `resolveJsonModule`, `sourceMap`, `allowImportingTsExtensions` and `noEmit`. It lacks the other house flags. Both packages are `"type": "module"`.
- **No Prettier, ESLint or Biome config** (`find . -name 'eslint*' -o -name '.prettierrc*' -o -name 'prettier.config*' -o -name biome.json` outside `node_modules` finds nothing). No `eslint-disable` or `@ts-ignore` comment exists either.
- **No `.npmrc`.** The bot packages pin exactly. `docs-site/package.json` has 16 `^` ranges (lines 18-28 and 31-35, plus `~6.0.2`). The root `overrides` (lines 31-37) are four security overrides with ranges, on purpose.
- **Scripts** (root `package.json`): `typecheck` is `npm run typecheck --workspaces --if-present` (only `docs-site` has the script; `shared` and `bots/discord` have none, so the bot's own code is not typechecked by it), `test` runs each workspace's `test`, and there is no `check`, `lint` or `format`.
- **One process, no server.** There is no Fastify, Express or `node:http` server (`grep -rn "fastify\|createServer\|express" bots shared --include=*.ts` finds nothing). The bot opens an outbound Discord gateway and binds no port ([infrastructure/Dockerfile](../../../infrastructure/Dockerfile), header). So there is no server-structure brief.
- **Environment access.** `process.env` appears at `shared/src/env.ts:19` (the loader), `bots/discord/src/jukebox/link.ts:61` and six test lines (`commands/jukebox.test.ts:6-8`, `commands/help.test.ts:6-8`). `bots/discord/src/env.ts:38` is the one config module. `loadEnv` (`shared/src/env.ts:15-17`) skips the file quietly when it is missing and then fails loudly if the schema needs a variable, so a moved `env.ts` would drop `.env` and stop the bot at boot on `DISCORD_TOKEN`, not run half-configured.
- **Root `CLAUDE.md`** exists (61 lines) with the commands. **`.claude/`** holds `settings.local.json` and `skills/`. `.gitignore` has no `.claude` line, so a new `.claude/rules/` is tracked.
- **The corpus numbers briefs 01-17 in `briefs/done/`**; numbering restarted at 01 on 2026-11-02 ([corpus/CLAUDE.md](../../CLAUDE.md)). The next number is 18.

### Measured on 2026-11-10

Taken on a scratch copy made with `rsync -a --exclude node_modules --exclude '.env' --exclude '.env.*' --exclude dist --exclude .git --exclude docs-site`, then `find <copy> -name '.env*'` to confirm none came across, with the repo's `node_modules` linked in. Prettier 3.9.10, typescript-eslint 8.72.2, TypeScript 6.0.3. No test was run.

**Prettier churn.** `trailingComma: "all"`, on the 133 tracked `.ts`, `.js`, `.mjs` and `.cjs` files outside `docs-site` (14,484 lines), `prettier --write --print-width <W> --trailing-comma all`, then `git diff --numstat`. The code is single-quoted (402 single-quoted imports, 0 double-quoted) and semicolon-terminated (5,623 lines end in `;`), so it is one of the house's outliers:

| `printWidth` | Double quotes (house): files, added, deleted | Single quotes kept: files, added, deleted |
|---|---|---|
| 100 | 131, 5,040, 3,547 | 91, 2,504, 1,011 |
| **120** | **131, 4,262, 3,691** | 77, 1,642, 1,071 |
| 130 | 131, 4,157, 3,826 | 79, 1,546, 1,215 |
| 150 | 131, 4,105, 4,062 | 84, 1,522, 1,479 |

The quote change is most of the churn: about 2,600 of the 3,691 deleted lines at 120. The line length (95th percentile 90 characters, maximum 201) is not the issue. Width 120 and double quotes are the owner's calls (Q8, Q9), so the reformat touches 131 of 133 files.

**TypeScript flags** (each added alone to `tsc --noEmit -p shared` and `-p bots/discord`, TypeScript 6.0.3, unique sites):

| Flag | Sites | Where |
|---|---|---|
| `isolatedModules`, `noImplicitOverride`, `noFallthroughCasesInSwitch` | 0 | |
| `erasableSyntaxOnly` | 19 | all parameter properties: `bots/discord/src/ask/limits.ts:26-27`, `jukebox/alone.ts:34-36`, `jukebox/atrium/errors.ts:32, 41-42`, `jukebox/atrium/request.ts:34-35`, `jukebox/atrium/session.ts:84`, `jukebox/buffer.ts:101-102`, `jukebox/player.ts:46-49`, `jukebox/speaker.ts:86-87` |
| `noUnusedLocals` | 11 (10 `TS6133`, 1 `TS6196`) | step 3 lists them |
| `noUnusedParameters` (not added, house list lacks it) | 3 more | |
| `verbatimModuleSyntax` | 26 | missing `type` on imports |
| `exactOptionalPropertyTypes` (not added now) | 8 | |
| `noUncheckedIndexedAccess` (deferred, Q50) | 160 | |

**The house shapes**, counted with the TypeScript parser over the 132 `.ts` files:

| Shape | Source | Tests |
|---|---|---|
| `enum`, `any`, `@ts-ignore`, `TODO`/`FIXME`, default exports, namespaces | 0 | 0 |
| non-null `!` | 63: `commands/rpg-buttons.ts` 9, `commands/blackjack2.ts` 8, `gambling/blackjack.ts` 7, `commands/mafia.ts` 6, `commands/quote.ts` 6, `mafia/phases.ts` 6, the rest in 10 files | 19: `ask/reply.test.ts` 2, `jukebox/format.test.ts:130`, `rpg/shop.test.ts:36`, `rpg/trade.test.ts` 6, `shared/src/reminders/parse.test.ts` 9 |
| `console` | 4: `jukebox/atrium/check.ts:20, 29` (a CLI) and `shared/src/logger.ts:7, 9` (the logger itself) | 0 |
| parameter properties | 19 (the list above) | 0 |
| classes | 13, six of them `extends Error`: `jukebox/atrium/errors.ts:7, 15, 23, 31, 39` and `wicket/client.ts:28` | 2 |

**ESLint**, one run on the scratch copy: typescript-eslint `projectService`, `@eslint/js` recommended, `typescript-eslint` recommended, the six typed rules (`no-floating-promises` with `node:test`'s `describe`, `it` and `test` in `allowForKnownSafeCalls`, `considerDefaultExhaustiveForUnions` on the switch rule), and the house-shape rules, over 133 files. **8 seconds wall, 0.77 GB peak.** `project` against `projectService` was not timed.

| Rule | Findings (source / tests) | Sites |
|---|---|---|
| `no-floating-promises` | 0 | |
| `no-misused-promises` | 3 / 0 | `bots/discord/src/index.ts:68`, `:190`, `bots/discord/src/commands/connect-four.ts:39` |
| `await-thenable` | 1 / 0 | `bots/discord/src/commands/jukebox.ts:172` |
| `switch-exhaustiveness-check` | 0 | |
| `no-unnecessary-type-assertion` | 19 / 8 | auto-fixable |
| `consistent-type-imports` | 44 / 1 | auto-fixable |
| `no-non-null-assertion` | 63 / 19 | the table above |
| `no-console` | 4 / 0 | `check.ts` (CLI) and `logger.ts` |
| `@typescript-eslint/no-unused-vars` (recommended) | 12 / 0 | duplicates `noUnusedLocals`, 11 sites |
| `no-restricted-syntax` (`enum`), `no-warning-comments`, `import-x/no-default-export`, `ban-ts-comment`, `no-explicit-any` | 0 | |

**Not measured here:** `knip`, `react-hooks` (no React outside `docs-site`), the 160 `noUncheckedIndexedAccess` sites' detail, and the time of the full `check`. The tests were not run because of the safety rule.

## Owner decisions

Decided on 2026-11-10 (the owner's answers and the technical calls, confirmed the same day):

1. **Vendored configs** (Q6). The `house-style` package is vendored: a copy with a version header, refreshed by a `house-style:sync` script that finds the checkout by name. No git or tarball dependency. The image's `deps` stage has no `git` either.
2. **Width 120** (Q8, Q51). Double quotes and semicolons (Q9): the 402 single-quoted imports and every string move in the one reformat commit.
3. **tsconfig** (Q11). `verbatimModuleSyntax` and `erasableSyntaxOnly` (parameter properties become fields). A TypeScript older than 5.8 is bumped first: here to 6.0.3, which the docs site already uses. `exactOptionalPropertyTypes` is not added, and `noUncheckedIndexedAccess` is deferred (Q50): its 160 sites are a later brief.
4. **Typed rules** (Q12): the six, through `projectService`, with `node:test`'s `describe`, `it` and `test` named in `no-floating-promises`'s `allowForKnownSafeCalls`.
5. **`!`** is an error in source and a warning in tests (Q47). **`considerDefaultExhaustiveForUnions: true`** (Q48).
6. **House shapes as errors** (Q13). `console` is allowed in CLIs. Default exports are allowed for config files.
7. **Markdown stays out of Prettier** (Q45). **A root `CLAUDE.md` with the commands** (Q46): this repo has one, so the brief adds lines to it.
8. **The Claude Code layer lives in the plugin** (Q7). **`check:fast`** is a typecheck plus ESLint on the changed files, built incrementally, target 15 s (Q10).
9. **No pull requests.** The work is committed on `main` (Q4).
10. **`node:test` stays** for this repo's tests for now. Q27 says vitest everywhere except atrium. Moving 33 test files is a brief of its own, and the `@vitest/eslint-plugin` rules do not apply until then. *Owner question.*

## Owner decisions (defaults)

1. **How `check` runs the tests.** Default: a new `test:clean` script copies the repo into an operating-system temporary folder without `node_modules`, `.git`, `docs-site` or any `.env*` file, links the real `node_modules`, and runs `npm test` there. `check` calls `test:clean`, never `npm test`. With no `.env` in the copy, the two tests that import `env.ts` read nothing from disk and use the dummy variables they set themselves (`help.test.ts:6-8`, `jukebox.test.ts:6-8`). The plain `npm test` stays for the owner. *Owner question: a better fix is for `env.ts` to skip the file under test, but that changes the bot's startup code and is a separate brief.*
2. **`no-process-env` (from `eslint-plugin-n`) at `error`**, allowed in `shared/src/env.ts` and the tests. The one other site is `bots/discord/src/jukebox/link.ts:61` (`staleJukeboxVars(process.env)`): pass the env in from `env.ts`'s caller or read the validated `env`. If that touches startup behaviour, list it in the outcome note instead.
3. **`no-console` exempts** `bots/discord/src/jukebox/atrium/check.ts` (a CLI) and `shared/src/logger.ts` (the logger).
4. **`docs-site` is out of Prettier and ESLint.** It is Docusaurus: React, default exports, its own conventions. It stays in the TypeScript alignment and the exact pins. *Owner question.*
5. **Exact pins in `docs-site`.** Its 16 ranges become the exact versions the lockfile resolves, so a bump is a deliberate commit. The four root `overrides` keep their ranges, because they are security floors.
6. **No knip and no dependency-cruiser in `check` yet.** Neither is measured here, and no layout rule needs dependency-cruiser. A later brief adds knip when its findings are measured.
7. **`typecheck` covers the bot's own workspaces.** Default: add `"typecheck": "tsc --noEmit"` to `shared` and `bots/discord`, so `npm run typecheck` checks the code that actually ships. Today it only checks the docs site.

## Files you OWN

- `tsconfig.base.json` (flags added) and each workspace's `package.json` (`typecheck`, pins).
- New: `eslint.config.js`, the Prettier config, `.prettierignore`, `.git-blame-ignore-revs`, `.npmrc`.
- Root `package.json` (scripts, devDependencies, the `typescript` pin) and `package-lock.json`.
- The reformat: whitespace and quote changes to every file Prettier covers.
- The fixes the new flags and rules ask for, and nothing else: the 19 parameter properties, 11 unused locals, 26 type-only imports, the 3 `no-misused-promises` and 1 `await-thenable` findings, the 63 non-null assertions in source, the auto-fixes, and `link.ts:61`.
- New: `scripts/test-clean.mjs`, `scripts/check-fast.mjs`, and the vendored `house-style` sync script under its shipped name.
- New: `.claude/rules/bot.md`.
- [CLAUDE.md](../../CLAUDE.md): the commands and the safety rule.
- Corpus: [wiki/decisions.md](../../wiki/decisions.md), [wiki/status.md](../../wiki/status.md), [log.md](../../log.md).

## Files you must NOT touch

- **`bots/discord/.env`** and any other `.env*` file, in any way. Not to read, copy, print, edit or "check that it is there".
- **Behaviour.** Apart from the listed fixes, every change is formatting or configuration. `bots/discord/src/index.ts`, `register.ts` and `env.ts` change only where a step names them.
- `docs-site/` source and the Docusaurus configuration, apart from the `typescript` pin and the exact pins of decision 5.
- `infrastructure/Dockerfile`: the bot has no build, and the harness adds nothing to the image. The `CMD` stays `node --import tsx bots/discord/src/index.ts`.
- `ecosystem.config.cjs`, the state files under `bots/data/` and `bots/discord/data/`, and the skills library.

## What to do

One commit per step. Before each commit run `npm run typecheck`, and run the tests only through the scratch copy (step 5's `test:clean`, or by hand with `rsync` and the exclusions in the safety rule).

1. **TypeScript alignment first.**
   1. Set the root `typescript` to 6.0.3, exactly, and `docs-site`'s to 6.0.3, exactly. Regenerate `package-lock.json` with `npm install --package-lock-only` so the root and docs-site resolve one version.
   2. `npm run typecheck` (the docs site) and `npx tsc --noEmit -p shared` and `-p bots/discord` must pass. They did on a scratch copy with 6.0.3. If TypeScript 6 changes a default (`types` is empty by default; `bots/discord/tsconfig.json` sets `["node"]` and `shared/tsconfig.json` does not), add the missing `types`.
2. **Measure first.** Re-run the measurements above on a scratch copy and add to the `log.md` entry the `projectService` against `project` lint times (one run each) and the `npx knip` findings for the later brief.
3. **tsconfig flags.** Add `verbatimModuleSyntax`, `erasableSyntaxOnly`, `noUnusedLocals`, `noImplicitOverride`, `noFallthroughCasesInSwitch` and `isolatedModules` (all four already pass). Then fix:
   - **26 `TS1484` sites:** inline `type` on the imports (`import { type X }`, the house form).
   - **19 parameter properties:** each becomes a declared field assigned in the constructor, same field order as the parameters. `errors.ts` keeps its `Error` behaviour (name, message, cause). Before editing, `grep -rn "JSON.stringify" bots shared --include=*.ts` and confirm none of the 13 classes is serialised by value.
   - **11 unused locals:** delete the local, and keep the call as a bare statement if its initialiser has an effect (a store write, a Discord call).
   Add the two `typecheck` scripts (default 7) in the same commit.
4. **Prettier, and the reformat.**
   1. Add `prettier` (pinned exactly) and its config: `printWidth: 120`, `trailingComma: "all"`, double quotes and semicolons (the defaults).
   2. Add `.prettierignore`: `*.md`, `docs-site/`, `node_modules/`, `package-lock.json`, `bots/data/`, `bots/discord/data/`, `dist/`.
   3. Add `"format": "prettier --write \"**/*.{ts,mjs,cjs}\""` and `"format:check"` with `--check`. Commit this alone. JSON, CSS and HTML were not measured and are not covered.
   4. Run `npm run format` and commit only that, as `style: format with Prettier`. Run it when no other brief has uncommitted work. It changes 131 of 133 files.
   5. Equivalence check on the commit (a throwaway script, not committed): for every file it changed, transform the file at `<hash>^` and at `<hash>` with esbuild using `minifyWhitespace` and `minifySyntax` but not `minifyIdentifiers`, and compare. The count of differing files goes in the outcome note, with each remaining diff read.
   6. Run the tests through the scratch copy and compare with a run on the commit before. Add the commit's full hash to `.git-blame-ignore-revs`, in its own commit, and hand the owner `git config blame.ignoreRevsFile .git-blame-ignore-revs`.
5. **ESLint.** Add `eslint.config.js` extending the vendored house config:
   - typed rules on `shared/src/**` and `bots/discord/src/**`, through `projectService`; `ecosystem.config.cjs`, `*.config.*` and `scripts/` take `disableTypeChecked`;
   - not linted: `docs-site/`, `bots/data/`, `bots/discord/data/`;
   - the rules of the table above, with decisions 1-6 of the first list and 2-3 of the second applied;
   - `@typescript-eslint/no-unused-vars` off in favour of `noUnusedLocals`, as the house does.

   Then fix the 3 `no-misused-promises`, the 1 `await-thenable` and the 63 non-null assertions in source (narrow with a guard, or restructure; do not add a cast), run `eslint --fix` for `no-unnecessary-type-assertion` and `consistent-type-imports` (one commit each, each followed by `npm run typecheck`), and fix `link.ts:61`. Tests keep their 19 `!` as warnings.
6. **The gate.** In the root `package.json`:
   - `lint` is `eslint .`;
   - `test:clean` is `node scripts/test-clean.mjs`: it makes the temporary copy (no `.env*`, no `docs-site`), links `node_modules`, runs `npm test` there, and fails if a `.env*` file exists in the copy before it starts;
   - `check` is `npm run typecheck && npm run lint && npm run format:check && npm run test:clean`;
   - `check:fast` is `npm run typecheck`, then `node scripts/check-fast.mjs`, which lints the files changed against `HEAD` plus untracked ones (`*.ts`, `*.mjs`, `*.cjs` that exist). No shell-only syntax: the owner works under WSL on Windows;
   - add `.npmrc` with `save-exact=true`, and pin `docs-site`'s ranges (default 5) in the same commit.

   Time `check:fast` warm with one changed file, and `check` in full, and record both.
7. **`.claude/rules/bot.md`** (`paths: ["bots/**", "shared/**"]`), under about 40 lines, pointing at [CLAUDE.md](../../CLAUDE.md), [wiki/decisions.md](../../wiki/decisions.md) and [wiki/glossary.md](../../wiki/glossary.md) instead of copying them:
   - relative imports keep `.ts` suffixes and the code runs under `tsx`;
   - the bot has no build step and no database;
   - one running instance per bot token, so never start the bot locally;
   - never read or print a `.env`;
   - tests run through `npm run test:clean`;
   - state is gitignored JSON under `bots/data/` and `bots/discord/data/`.
8. **`CLAUDE.md`.** Add to "Working in this repo": `npm run check` before every hand-back, `npm run check:fast`, `npm run format`, and the safety rule in one line ("never run `npm test` here: it loads the production `.env`; use `npm run test:clean`"). Correct the line that says verify with `npm test`. Keep the file under about 80 lines.
9. **Corpus.** Add the [wiki/decisions.md](../../wiki/decisions.md) entry "The house style, formatted and checked": the width and quotes, why `test:clean` exists, why `node:test` stays, why `docs-site` is out. Update [wiki/status.md](../../wiki/status.md) and [log.md](../../log.md), and run `npm run corpus:lint` until it is clean.

## Acceptance

- [ ] `npm run check` passes. Its run time and `check:fast`'s, warm with one changed file, are in the outcome note, and `check:fast` is under about 30 s or the owner has accepted the time.
- [ ] `grep -n '"typescript"' package.json shared/package.json bots/discord/package.json docs-site/package.json` shows one exact version, and `npm ls typescript` shows one.
- [ ] `npx prettier --check "**/*.{ts,mjs,cjs}"` passes. The reformat is one commit, its hash is in `.git-blame-ignore-revs`, and step 4.5's equivalence check reports the number of differing files, each remaining diff read and noted.
- [ ] `tsconfig.base.json` has `verbatimModuleSyntax`, `erasableSyntaxOnly` and `noUnusedLocals`, and `npm run typecheck` passes in all three workspaces.
- [ ] `npm run lint` reports zero errors. A deliberate `enum`, `// TODO: x`, `console.log` in `bots/discord/src/index.ts`, an unawaited promise and a `process.env.X` in `bots/discord/src/ask/limits.ts` each fail it. Revert them after.
- [ ] `npm run test:clean` passes, and `node scripts/test-clean.mjs` fails when run with a `.env` planted in its source folder's copy list (test on a scratch checkout, never in this one).
- [ ] `git check-ignore .claude/rules/bot.md` prints nothing and the file has `paths:` frontmatter.
- [ ] `.npmrc` has `save-exact=true`, and `git ls-files '.github'` lists nothing.
- [ ] With the plugin's hooks on, an agent's edit is formatted on save, and a type error stops it at `Stop`.
- [ ] `npm run corpus:lint` ends clean.

## Interplay

- **Base UI, Tailwind, a redesign:** none. The owner's calls are for web apps, and this repo's only web UI is the Docusaurus docs site, which is out of scope. The bot's own UI is Discord messages and buttons, not DOM. No package depends on `@base-ui/react`.
- **No server brief:** the repo has no Fastify and no HTTP routes; it is a gateway client. Zod is already 4.4.3. The skills library's checkers do not run here, so no `conventions.json`. The reformat touches 131 files, so run step 4 when nothing else is open. The new devDependencies enter the image's `npm ci`, on a box with 3.7 GiB shared: report the image size before and after step 6.
