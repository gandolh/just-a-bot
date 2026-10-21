# Task 36: RPG: character names must not ping members

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
