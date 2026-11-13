# Task 19: The image installs production dependencies only

Promoted on 2026-11-13 from the todo `image-without-dev-tools` (found while
building brief 18, 2026-11-11).

## Context

The Dockerfile's `npm ci` keeps devDependencies because the bot runs under
`tsx`, and `tsx` is a devDependency. Brief 18 pinned the house tools (ESLint,
Prettier, knip, dependency-cruiser and the rest) as devDependencies, so they
ship in the image too. As a stand-in for a docker build, `npm ci
--ignore-scripts` on the files the `deps` stage copies went from 62 packages
and 87 MB to 277 packages and 197 MB.

Two ways out: move `tsx` to `dependencies` (the escape hatch
[decisions.md](../../wiki/decisions.md) already names), or run on Node 24's
own type stripping so `tsx` isn't needed at run time. The second would mean
`erasableSyntaxOnly` across the code, and Node does not strip types in files
under `node_modules`, where the `@bots/shared` workspace link resolves from
some paths. The first is the smaller, safer change.

## Files you OWN

- `package.json`, `package-lock.json`, `infrastructure/Dockerfile`
- `corpus/log.md`, `corpus/wiki/decisions.md`, `corpus/wiki/status.md`

## Files you must NOT touch

- Anything under `bots/` or `shared/` besides `package.json` files, and every
  `.env` file.

## What to do

1. Move `tsx` from the root `devDependencies` to `dependencies`, at the same
   exact pin.
2. In `infrastructure/Dockerfile`, run `npm ci --omit=dev` in the `deps` stage
   and rewrite the header comment that says the image keeps dev dependencies.
3. Measure `node_modules` before and after on an exported copy of the tree
   with `npm ci --omit=dev --ignore-scripts`, and check the runtime entry
   resolves its imports without connecting anywhere.
4. Update the decisions, status and log lines that say the image installs
   the dev tools.

## Acceptance

- `npm ci --omit=dev` leaves `tsx` installed and no ESLint, Prettier, knip or
  dependency-cruiser.
- `npm run check` and `bash corpus/lint.sh` pass.
- Owner steps: deploy with `node cli.ts just-a-bot server`, then check the
  container starts and the bot answers once.
