# Task 02 — Remove the `/dicetable` feature

## Context

The Discord Activity experiment is over. `bots/dice-activity` was deleted on
2026-08-27 (it was added and disabled in the same commit, `0de2132`, 2026-06-03,
and never ran on the VPS). What remains in `bots/discord` is a WebSocket *client*
of an app that no longer exists: `/dicetable` is registered and visible in
Discord but can only ever answer "not configured".

Decision and rationale: [decisions.md](../../wiki/decisions.md) →
"`/dicetable` removed — the Activities experiment is concluded". Deleting was
chosen over shelving because there is no planned revival; Activities will be
revisited as a new build.

## Files you OWN

- `bots/discord/src/dicetable/` — delete the directory (`engine.ts` 225,
  `link.ts` 139, `store.ts` 87)
- `bots/discord/src/commands/dicetable.ts` — delete
- `bots/discord/src/commands/index.ts` — drop the `dicetable` import (line ~20)
  and its entry in the `all` array (line ~43)
- `bots/discord/src/index.ts` — drop the `startLink as startDiceTableLink` import
  (~line 21) and the `if (env.DICE_ACTIVITY_WS_URL && env.DICE_ACTIVITY_TOKEN)`
  guard that calls it (~lines 202-204)
- `bots/discord/src/env.ts` — drop `DICE_ACTIVITY_WS_URL`,
  `DICE_ACTIVITY_TOKEN`, `DICETABLE_ACTIVITY_URL` and their comment block
  (~lines 22-26)
- `shared/src/dice-protocol.ts` — delete. Its only consumers are
  `dicetable/link.ts` and `dicetable/store.ts`, both going in this brief.
- `shared/src/index.ts` — drop the `export * from './dice-protocol.ts';` line
- `docs/discord/dicetable/` — delete the directory
- `docs/discord/README.md` — remove the dicetable entry if it lists one
- `bots/dice-activity/` — delete the leftover directory, including its `.env`

## Files you must NOT touch

- `bots/discord/src/player.ts` and anything music-related — brief 03 owns that
- `shared/src/{env,logger}.ts`, `shared/src/reminders/` — `shared/` stays a
  workspace; only the dice protocol leaves it
- Any other command or feature dir

## What to do

1. Delete the files and directories listed above; remove the import/registration
   sites in `commands/index.ts`, `index.ts`, `env.ts` and `shared/src/index.ts`.
2. Delete `bots/dice-activity/` entirely. **Its `.env` holds real secrets**
   (`DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `SESSION_HMAC_KEY`,
   `ENGINE_AUTH_TOKEN`) and is gitignored, so this is irreversible — it is
   explicitly authorised here, and the user rotates/deletes the Discord app
   separately in the developer portal.
3. `grep -rn "dicetable\|DiceGameWire\|DICE_ACTIVITY\|DICETABLE\|dice-protocol"`
   over `bots/ shared/ docs/` and confirm nothing survives. Use grep, not the
   code graph — completeness on a deletion is a grep job
   (`.claude/skills/codegraph/SKILL.md`).
4. Update the wiki: `architecture.md` (the `shared/` description names the
   dice-table wire protocol, and the two-workspace justification leans on it —
   rewrite that justification around the remaining no-`discord.js` code),
   `status.md`, and remove the `/dicetable` entry from `open-questions.md` (it is
   now answered). Regenerate the catalog: `bash corpus/lint.sh --index`.
5. Append a `log.md` entry.

## Acceptance

- `npm run typecheck` clean.
- `bash corpus/lint.sh` clean.
- The grep in step 3 returns nothing.
- `shared/` still exists as a workspace with `env.ts`, `logger.ts` and
  `reminders/`.
- `open-questions.md` no longer lists `/dicetable`.
