---
summary: The genuinely unresolved threads only — currently why /dnd and /post are hidden and what should happen to them.
updated: 2026-08-27
---

# Open questions

Only genuinely unresolved threads. Delete each the moment it's answered.

A question that is **blocked** rather than unanswered does not belong here — it
is a step in whatever plan unblocks it. Two such questions (automating yt-dlp
freshness, Opus passthrough viability) moved to
[reenable-music.md](../todos/reenable-music.md) on 2026-08-27: neither is askable
while music is shelved and YouTube is disabled, because nothing in the repo runs
yt-dlp at all.

- **Why are `/dnd` and `/post` hidden, and what should happen to them?** Both are
  commented out of `commands/index.ts` with no recorded reason — `/dnd` in commit
  `0e41efc` ("save"), `/post` in `732889c` ("comment post for now"). `/dnd` is the
  larger of the two (a ~35 KB command plus `dnd/state.ts`); `/post` carries an
  Instagram Graph API integration and two env vars. Until someone says why, the
  fate is undecidable: **temporarily hidden** (leave them, the docs now say
  "hidden"), **shelved indefinitely** (record a decision, as music got), or
  **abandoned** (delete, as `/dicetable` was). The false claims that both worked
  were corrected on 2026-08-27; only the intent is still open.

The `/dicetable` question was answered on 2026-08-27 (delete it — see
[decisions.md](decisions.md) and brief 02) and removed from this page, per the
rule above.

Live threads that are *not* open questions:

- Rebuilding music — a plan, not a question:
  [reenable-music.md](../todos/reenable-music.md).
- Whether Discord Activities return, and in what form — deferred by the user, not
  under investigation.
