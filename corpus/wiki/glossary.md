---
summary: The project's vocabulary — what command, feature dir, sibling command and shelved mean here, plus the Jukebox terms (jukebox, player, track, playlist, queue, bot account) borrowed from atrium, and which synonyms to stop using.
updated: 2026-10-08
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
where the code is deleted and reviving it means rebuilding. Nothing is currently
shelved.
_Avoid_: removed, deleted, turned off — for a *shelved* thing. Say "removed" only
when the code is actually gone.

## Music (the Jukebox)

These terms are defined by atrium, which owns the Jukebox. Atrium's Jukebox
glossary page is the authority, and these entries repeat it so the bot's code
and docs use the same words.

**Jukebox**:
The feature that lets this bot play atrium's music in a voice channel, and
atrium's page that controls it.
_Avoid_: music bot, radio, DJ

**Player**:
One guild's Jukebox state. It holds the voice channel the bot sits in, the
Track playing, its position, whether it is paused, and what plays next. One per
guild, keyed by guild ID.
_Avoid_: instance, bot instance, session, queue (the queue is one part of a Player)

**Track**:
An atrium library item of media kind `audio`, as the Jukebox plays it. The only
thing the bot plays.
_Avoid_: song (fine in replies to users, not in code or docs), file, mp3

**Playlist**:
Every Track in atrium's music library, in the order a Player walks through it.
Not a separate list: deleting from it deletes from atrium.
_Avoid_: library (when the walking order is the point), collection

**Queue**:
A Player's short list of Tracks that play before the Playlist continues. The
only list anyone reorders or clears. `/jukebox play` adds to it.
_Avoid_: up next, playlist

**Bot account**:
The Ward account this bot signs in to atrium as. Its `atrium` grant carries the
role `jukebox`, which atrium enforces as an allowlist.
_Avoid_: bot user, bot profile, service account
