---
summary: The project's vocabulary — what command, feature dir, sibling command and shelved mean here, and which synonyms to stop using.
updated: 2026-08-27
---

# Glossary

Definitions only — one canonical meaning per term, plus the synonyms it
displaces. If an entry starts explaining *how* something works, that belongs on
a concept page and this should link there instead. Only terms this project uses
in a particular way earn an entry.

## The bot's shape

**Command**:
A single slash command, implemented as one module in
`bots/discord/src/commands/` that exports the `Command` shape
(`data` + `execute`, optional `autocomplete`) from `commands/types.ts`. Thin by
convention — a command validates input and delegates to a feature dir.
_Avoid_: handler, endpoint, slash handler

**Feature dir**:
One directory per capability under `bots/discord/src/` (`rpg/`, `mafia/`,
`gambling/`, `ollama/`, …) holding that capability's logic and state. The unit
of ownership: a change to one feature should touch one feature dir. See
[architecture.md](architecture.md).
_Avoid_: module, package, service

**Sibling command**:
A `/featureN+1` variant (`dice` → `dice2`, `blackjack` → `blackjack2`) that
offers a materially different UX for a working feature while sharing extracted
code with it. Both stay registered; the original is never rewritten in place.
See [decisions.md](decisions.md).
_Avoid_: v2, fork, replacement

**Shelved**:
A finished feature whose commands are commented out of
`bots/discord/src/commands/index.ts` — invisible in Discord — with all of its
code kept intact and re-enablable by uncommenting. Distinct from **removed**,
where the code is deleted and reviving it means rebuilding. Music was shelved in
June and then *removed* in August; nothing is currently shelved.
_Avoid_: removed, deleted, turned off — for a *shelved* thing. Say "removed" only
when the code is actually gone.

## Retired terms

**Provider** and **Extractor** were defined here while the music subsystem
existed (a *provider* was the upstream service, an *extractor* the
discord-player class that talked to it). Both were removed with the code on
2026-08-27. The distinction is preserved in [music.md](music.md) and matters
again only if music is rebuilt — it is not current vocabulary.
