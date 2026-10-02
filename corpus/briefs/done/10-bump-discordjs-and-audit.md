# Task 10 — Bump discord.js to 14.27.0 and clear the production audit

## Context

Source: the 2026-09-26 improvements audit, recorded in [log.md](../../log.md).
Rank 7 of 16.

`npm audit --omit=dev` on 2026-09-26 reports 5 vulnerabilities, 2 of them high:

- undici ≤6.27.0: 7 advisories, pulled in by discord.js 14.26.4 and
  @discordjs/rest 2.6.1.
- ws 8.0.0-8.20.1: a memory-exhaustion DoS, via @discordjs/ws.
- fflate 0.7.0-0.7.4, via satori's dependencies.
- discord.js and @discordjs/rest themselves, flagged for depending on the
  vulnerable undici.

These are hard to exploit here, because the bot's only network peers are
Discord's own gateway and REST servers. The fix is cheap, though.
`bots/discord/package.json:15` pins discord.js exactly (`"14.26.4"`), which is
why `npm audit fix` can't lift it. The fix is 14.27.0, a minor release within v14.

The same file pins discord.js and zod exactly but gives caret ranges to `satori`
(`^0.26.0`) and `@resvg/resvg-js` (`^2.6.2`), the `/img` rendering stack. Any
lockfile regeneration can move the renderer under the image templates without a
code change. The installed versions today are satori 0.26.0 and
@resvg/resvg-js 2.6.2.

## Files you OWN

- `bots/discord/package.json` (dependencies only)
- `package-lock.json`

## Files you must NOT touch

- `docs-site/package.json` and its dependencies. They're dev-only, and
  `--omit=dev` already excludes them.
- The `scripts` blocks. Brief 19 adds test scripts to these same package files,
  so sequence the two.

## What to do

1. In `bots/discord/package.json`, set `"discord.js": "14.27.0"`,
   `"satori": "0.26.0"` and `"@resvg/resvg-js": "2.6.2"`, all exact.
2. Run `npm install` at the root, then `npm audit fix`. Never use `--force`.
   This lifts ws and fflate within their ranges.
3. Skim the discord.js 14.27.0 release notes for anything touching the APIs this
   bot uses: interaction reply options (`ephemeral` vs `flags`), `withResponse`,
   `deferReply`.

## Acceptance

- `npm ls discord.js` shows 14.27.0.
- `npm audit --omit=dev` reports 0 vulnerabilities, or names each remaining one
  and why it stays.
- `npm run typecheck` clean.
- The dev bot boots, and `/ping`, `/blackjack` (press Hit or Stand) and
  `/img meme` all work. The last one exercises satori and resvg.
- If Docker is available, `docker compose -f infrastructure/docker-compose.yml build`
  still succeeds with the new lockfile.

## Outcome (2026-10-02)

discord.js is pinned at 14.27.0, and the `/img` renderer is pinned exactly:
satori 0.26.0 and @resvg/resvg-js 2.6.2, the versions already installed. After
`npm install` and `npm audit fix` (no `--force`), both `npm audit` and
`npm audit --omit=dev` report **0 vulnerabilities**. The 14.27.0 release notes
list no breaking changes or deprecations touching reply options
(`ephemeral`/`flags`), `withResponse`, `deferReply`, `followUp`, `editReply` or
`allowedMentions`. The one relevant fix makes `update()`'s options optional.

Verified: `npm ls discord.js` shows 14.27.0, `npm run typecheck` is clean, and
`docker compose -f infrastructure/docker-compose.yml build` succeeds with the
new lockfile. **Not verified live:** `/ping`, `/blackjack` and `/img meme` on
the dev bot (no dev token here).
