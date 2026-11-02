# Task 08: RPG: character names must not ping members

## Context

`commands/rpg-buttons.ts:132` takes the modal's name unchecked (up to 24 characters, `:102`). It is
interpolated into town-crier lines (`rpg/combat.ts:151`, `rpg/crier.ts:19`) and duel proposals,
while the client's default `allowedMentions` parses users (`index.ts:48`). A character named
`<@123456789012345678>` pings that member on every crier line about the character, and the death
line can be farmed by losing fights.

Improvement sweep of 2026-10-20 (security/abuse lens), vetted against the code; the ranked report is the owner's "Repo improvement sweep" doc.

## Files you OWN

- `bots/discord/src/commands/rpg-buttons.ts` (name validation)
- `bots/discord/src/rpg/crier.ts` and the duel proposal sends (send options)
- `bots/discord/src/rpg/world.ts` (clean existing names on load)
- tests

## What to do

1. Strip mention syntax (`<@…>`, `<@&…>`, `<#…>`), @everyone, @here and backticks from names at creation, and from existing names when a world loads.
2. Send game text with `allowedMentions: { parse: [] }`, naming users explicitly where a ping is intended (the defender in a duel).

## Acceptance

- A test: creating a character named `<@1>` stores a cleaned name.
- Crier sends carry no user parsing.

## Outcome (2026-11-02)

Built in `8669f37`.

- `rpg/world.ts` gains `cleanCharacterName()`: strips `<@id>`, `<@!id>`,
  `<@&id>`, `<#id>`, @everyone and @here (any case) and backticks, collapses
  whitespace, trims, and cuts to 24 code points. `makeCharacter()` (in
  `commands/rpg.ts`) applies it and falls back to the Discord username, then
  "Adventurer", when nothing is left. `loadWorld()` cleans every stored name.
- `rpg/crier.ts` builds each post with `crierMessage()`, which sets
  `allowedMentions: { parse: [] }`.
- The duel proposal sends with `allowedMentions: { users: [defenderId] }`,
  and the defender's `<@id>` moved from the edit that adds the buttons into
  the first post: Discord does not notify for a mention added by an edit, so
  the intended ping never reached the defender. The edit keeps the same text.
- The trade proposal names both sides in embed field names, which never
  ping, so it was left alone. The duel's later `editReply`s carry names but
  are edits, which do not notify.

Checks: typecheck clean; bot tests 84/84. New `rpg/names.test.ts`: a
character created as `<@1>` gets the fallback name, `Sir <@1> the Bold`
becomes `Sir the Bold`; the stripping cases; crier posts parse no mentions.
The load-time cleaning has no test, since `loadWorld` reads the real data
directory. The bot was not run.

Found: the RPG manual (`docs/discord/rpg/README.md`) documents slash
subcommands that no longer exist; filed as
[a todo](../../todos/rpg-docs-describe-old-commands.md) rather than fixed here.

**Owed by the owner** (optional, live): a duel challenge notifies the
defender once; a character created as `<@your id>` shows your username.
