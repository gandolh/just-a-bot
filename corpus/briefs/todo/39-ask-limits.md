# Task 39: `/ask`: limit the model, the rate and the length

## Context

`commands/ask.ts:51` passes any member-chosen model name (up to 100 characters) to Ollama with
the owner's `OLLAMA_API_KEY` (`ollama/chat.ts:34`). There is no per-member rate limit or
concurrency cap, and `:83-85` posts every 2000-character slice of the answer as its own public
follow-up, with no cap. Errors are public too, because the deferral is not ephemeral.

Improvement sweep of 2026-10-20 (security/abuse lens), vetted against the code; the ranked report is the owner's "Repo improvement sweep" doc.

## Files you OWN

- `bots/discord/src/commands/ask.ts`
- `bots/discord/src/ollama/chat.ts`
- the env schema, if an allowlist variable is added
- tests

## What to do

1. Offer the model as choices from an allowlist (for example `OLLAMA_MODELS`, defaulting to the configured model).
2. Add a per-member cooldown and one request in flight per member.
3. Cap the follow-ups at two and say the answer was cut.

## Acceptance

- Tests for the cooldown and the follow-up cap.
- An unknown model is refused.
