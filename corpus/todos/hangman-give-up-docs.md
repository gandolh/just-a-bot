---
title: /hangman give-up is documented but not registered
created: 2026-10-02
status: done
---

# `/hangman give-up` is documented but not registered

> **Done 2026-10-06: the page was stale.** `f67bb0d` (2026-06-02, "fixed tz, hangman and img command") removed the subcommand on purpose, so `docs/discord/hangman/README.md` no longer documents it.

Found 2026-10-02 while writing the games pages (brief 22) and building `/help`
from the registry (brief 21).

`docs/discord/hangman/README.md` documents `/hangman give-up` (starter or admin
reveals the word and archives the thread), but `commands/hangman.ts` registers
only `/hangman start`, which is all `/help` now lists. Either the subcommand was
dropped and the page is stale, or it was planned and never built. Decide which,
then fix the page or add the subcommand.
