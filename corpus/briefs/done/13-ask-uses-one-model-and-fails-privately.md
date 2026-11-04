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

## Outcome (2026-11-04)

Built in the commit that moved this brief to `done/` ("Brief 13: /ask uses
one model and fails privately").

- `/ask`'s definition has one option, `prompt`. Every question goes to
  `env.OLLAMA_MODEL`. `OLLAMA_MODELS` is gone from `env.ts`, `.env.example`,
  the Ask manual and the README's command table; `allowedModels()`,
  `pickModel()` and their tests are gone from `ollama/limits.ts`, which now
  holds only the in-flight and cooldown rules. `env.ts`'s schema is a plain
  `z.object`, so a leftover `OLLAMA_MODELS=` in production's `.env` is
  ignored; the owner need not touch the file.
- On a failure (an `OllamaError`, the 60 s timeout, anything else thrown by
  the call) `failPrivately()` in `ollama/reply.ts` deletes the public
  deferred reply, then sends `⚠️ <reason>` as an ephemeral follow-up. The
  delete comes first because Discord fills a still-loading deferred reply
  with the first follow-up and keeps the deferral's flag (the same quirk
  `commands/jukebox.ts` works around). A failed delete is logged and the
  member is still told. A successful answer is public, as before.
- Each failure is now logged, `[WARN] [ask] /ask failed: <reason>`, since the
  channel no longer shows it; the Ask manual has a Triage section for it.
- Brief 11's limits are untouched: one question in flight, 30 s between
  questions, at most three messages per answer.

Checks: typecheck clean; `ollama/limits.test.ts` and `ollama/reply.test.ts`
6/6; full `npm test` 99/99 in the bot (two model tests removed, two added)
and 5/5 in `shared`. The new tests drive `failPrivately()` with a recording
fake: the delete comes before an ephemeral follow-up, and a delete that
throws is reported while the follow-up still goes out. The bot was not run
and the commands were not registered, so the live behaviour is unchecked:
in particular that Discord sends an ephemeral follow-up as a new private
message once the deferred placeholder is deleted. That is the documented
workaround, but nothing here proves it.

**The command definition changed, so the deploy must re-register the slash
commands.** vps-deploy's just-a-bot stack already runs `npm run
discord:register` on every deploy.

**Owed by the owner:**
- Deploy from vps-deploy: `node cli.ts just-a-bot deploy` (it re-registers
  the commands).
- After the deploy, `/ask` offers only `prompt`. A failing question (easiest
  on a dev application with a wrong `OLLAMA_API_KEY`) leaves nothing in the
  channel and shows the asker `⚠️ Ollama returned 401: …` privately.
