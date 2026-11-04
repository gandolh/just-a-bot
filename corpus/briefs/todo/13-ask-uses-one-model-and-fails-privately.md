# Task 13: `/ask` uses one model and fails privately

## Context

Brief 11 (2026-11-02) let a member pick `/ask`'s model from `OLLAMA_MODEL`
plus an optional `OLLAMA_MODELS` list. In a grill on 2026-11-04 the owner
decided members don't choose: **`/ask` always uses `OLLAMA_MODEL`**, with no
model option at all. In the same grill: when Ollama fails (an error, the
timeout, a used-up quota), the failure is **private**, like `/ask`'s other
refusals, instead of a public ⚠️ line in the channel.

Today the reply is deferred publicly (`deferReply()`), so the error edits a
public message. A deferred reply can't turn ephemeral afterwards.

## Files you OWN

- `bots/discord/src/commands/ask.ts`
- `bots/discord/src/ollama/limits.ts` and its tests (drop `allowedModels` /
  `pickModel` if nothing else needs them)
- `bots/discord/src/env.ts` (drop `OLLAMA_MODELS`)
- `bots/discord/.env.example`, `docs/discord/ask/README.md`

## Files you must NOT touch

- `bots/discord/.env` (production's values). Don't run the bot or register
  commands; the owner re-registers on deploy.

## What to do

1. Remove the `model` option from the command definition, and
   `OLLAMA_MODELS` from env, `.env.example` and the docs. `/ask` sends every
   question to `OLLAMA_MODEL`.
2. On an Ollama failure, delete the deferred public reply and send the
   reason to the member alone (`followUp({ ephemeral: true })`). A successful
   answer stays public, as now.
3. Keep brief 11's limits: one question in flight per member, 30 s between
   questions, at most three messages per answer.
4. Note in the outcome that the command definition changed, so the deploy
   must re-register commands.

## Acceptance

- `/ask` has one option, `prompt`.
- A failed call leaves nothing in the channel; the member sees why.
- `npm run typecheck` and `npm test` pass.

## Later

Brief 14 moves `/ask` onto Wicket, the estate's LLM queue, once Wicket is
deployed. Build this one first; 14 builds on its private failure path.
