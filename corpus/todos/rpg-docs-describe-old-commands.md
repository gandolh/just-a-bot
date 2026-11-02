---
title: The RPG manual describes slash commands that no longer exist
created: 2026-11-02
status: open
tags: [rpg, docs]
---

# The RPG manual describes slash commands that no longer exist

Found while building brief 08 (2026-11-02). `docs/discord/rpg/README.md`'s
command table and quick start list `/rpg join name:… glyph:…`, `move`, `look`,
`attack`, `duel @user`, `trade @user` and more. The command in
`bots/discord/src/commands/rpg.ts` has three subcommands, `start`, `exit` and
`help`; everything else, character creation included, is the button
controller and its modal. The manual needs a rewrite against the code, and
its character-name line should say that mention syntax, @everyone, @here and
backticks are stripped.

The rewrite should also cover the limits added the same day: a 15 s wait
between duel or trade proposals per member, one pending duel and one open
trade per pair, and duels and trades pruned once over (or after a day).
