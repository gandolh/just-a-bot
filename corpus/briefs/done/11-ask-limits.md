# Task 11: `/ask`: limit the model, the rate and the length

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

## Outcome (2026-11-02)

Built in `518d4a4`.

- `env.ts` gains the optional `OLLAMA_MODELS` (comma-separated).
  `allowedModels()` in `ollama/limits.ts` makes the list: `OLLAMA_MODEL`
  first, then `OLLAMA_MODELS`, trimmed, without blanks, repeats or names over
  100 characters, at most 25. The `model` option offers them as choices;
  `pickModel()` refuses anything else with "That model isn't one of the
  models offered here." (ephemeral). Unset, `OLLAMA_MODEL` is the only one,
  which is what production gets until the owner adds more.
- `AskLimiter` gives each member one question in flight and 30 s between
  questions (in memory). The slot is taken before `deferReply`, and freed in a
  `finally`. The cooldown counts from the question whatever the answer, since
  a timeout costs the key as much as an answer.
- `ollama/reply.ts`'s `answerMessages()` keeps the old split and returns at
  most three messages (the reply and two follow-ups); a longer answer's last
  message is shortened to end with "*(Answer cut: it ran past three
  messages.)*".
- The rules sit in modules that do not import `env.ts`, so their tests never
  load the bot's `.env` (production's, since 2026-11-02) and can never reach
  Ollama.
- Not done: Ollama's errors are still posted publicly, because the reply is
  deferred publicly before the answer is known. The brief's context named it
  but its steps did not; making errors ephemeral means deferring ephemerally
  and posting a successful answer as a fresh follow-up, which changes how
  every answer looks.

Checks: typecheck clean; bot tests 99/99, shared 5/5. New
`ollama/limits.test.ts` (the model list, an unknown model refused and no pick
meaning the default, in flight then cooldown with a fake clock) and
`ollama/reply.test.ts` (a short answer is one message; a 2000-word answer is
three messages of at most 2000 characters ending with the cut note; an answer
that fits three is not cut). `.env.example` and the Ask manual list
`OLLAMA_MODELS`. The bot was not run and the commands were not registered.

**Owed by the owner:**
- Decide whether `/ask` should offer more than `OLLAMA_MODEL`; if so, add
  `OLLAMA_MODELS` to production's `.env`. The deploy registers the commands,
  which is when the choices change.
- After the deploy, `/ask` twice quickly gets "still being answered", and a
  third question within 30 s gets the wait message.
