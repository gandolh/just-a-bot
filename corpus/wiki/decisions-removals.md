---
summary: Features deleted outright rather than shelved — /dicetable (2026-08-27), /dnd and /post (2026-10-06) — with the reasons and the owner's follow-ons.
updated: 2026-10-07
---

# Decisions: removed features

Split out of [decisions.md](decisions.md) on 2026-10-06. Music has its own entry
in decisions.md.

## `/dicetable` removed — the Activities experiment is concluded

_2026-08-27_ — The `/dicetable` feature is deleted outright: `dicetable/`
(451 lines), `commands/dicetable.ts`, `shared/src/dice-protocol.ts`, the <!-- stale-ok -->
`DICE_ACTIVITY_WS_URL` / `DICE_ACTIVITY_TOKEN` / `DICETABLE_ACTIVITY_URL` env
vars, and the docs page. Rejected: shelving it the way music was shelved (the
precedent existed and was considered), and hosting the Activity from its own repo
to make the client work again.
Reason: the Activity app was added and disabled in the *same* commit
(`0de2132`, 2026-06-03) and never ran on the VPS — this was an experiment that
ended at birth, not a working feature that broke. Shelving preserves code for a
revival that isn't planned; Discord Activities will be revisited as a *new* build
rather than by reviving this one.
Cost accepted: the Activity plumbing writeup (OAuth, session, the `/play` +
`/engine` WebSockets, per-channel instance lifecycle) is deleted with the docs
page and survives only in git history — chosen knowingly over keeping a 92-line
reference page.
Follow-on the user owns: `bots/dice-activity/.env` is deleted locally, but <!-- stale-ok -->
`DISCORD_CLIENT_SECRET`, `SESSION_HMAC_KEY` and `ENGINE_AUTH_TOKEN` must be
**rotated or the Discord app deleted** in the developer portal — deleting a local
file does not invalidate a live secret.

## `/dnd` and `/post` deleted, not shelved

_2026-10-06_ — Hidden since early June with no recorded reason, both are
deleted with their modules, env vars and docs; git history keeps them.
Rejected: shelving (the music precedent) and re-enabling. Owner follow-on: revoke
any Instagram token issued for `/post` in Meta's console.
