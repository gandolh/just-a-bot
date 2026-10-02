---
title: /hangman give-up is documented but not registered
created: 2026-10-02
status: open
---

# `/hangman give-up` is documented but not registered

Found 2026-10-02 while writing the games pages (brief 22) and building `/help`
from the registry (brief 21).

`docs/discord/hangman/README.md` documents `/hangman give-up` (starter or admin
reveals the word and archives the thread), but `commands/hangman.ts` registers
only `/hangman start`, which is all `/help` now lists. Either the subcommand was
dropped and the page is stale, or it was planned and never built. Decide which,
then fix the page or add the subcommand.
