# Task 14: `/ask` goes through Wicket

## Context

On 2026-11-04 the owner decided the estate gets one service for LLM calls,
**Wicket** (its own repo): it holds the Ollama key, queues every call in one
first-come-first-served queue, runs **one call at a time**, and gives each
call a **ticket number**, like a market counter ("you're number 14, now
serving 11"). It tries Ollama Cloud first and falls back to a small model on
the VPS (`gemma3:1b`) when the cloud fails. Wicket picks the model; callers
don't. `/ask` and ro-housing are its first two callers.

**Wait for Wicket.** Don't start until Wicket is built and deployed and its
README matches the contract below; if it differs, follow Wicket's README and
say so in the outcome. Runs after brief 13.

Wicket's API contract (the same text is in Wicket's and ro-housing's briefs):

> Callers set `WICKET_URL` (the API base) and `WICKET_TOKEN` (a per-app bearer
> token that names the app). `POST {WICKET_URL}/v1/jobs` with
> `{ messages: [{role, content}], format?: "json" | <JSON schema> }` →
> `202 { id, ticket, nowServing, position, status }`.
> `GET {WICKET_URL}/v1/jobs/:id` (optional `?wait=25` long-polls) →
> `{ id, ticket, nowServing, position, status: "queued"|"running"|"done"|"failed"|"cancelled", result?: { text, model, backup }, error? }`.
> `DELETE {WICKET_URL}/v1/jobs/:id` cancels the caller's own job.

Wicket was built on 2026-11-04 (not deployed yet); its full API is in its
repo's `corpus/wiki/api.md`. Beyond the contract above, a caller must know:
send only `messages` (and `format`), since unknown fields are a 400; a 404
for a job (after a Wicket restart, say) means cancelled; 503 `queue_full`
past 200 waiting jobs; `?wait` above 25 is held to 25; a finished answer is
kept 10 minutes, so fetch it promptly; a cancelled job's `error` gives the
reason (caller, force closed, cleared, server restarted). On the VPS the bot
must call the public `/wicket-api` address, not Wicket's loopback port: under
the rootless Docker daemon a container can't reach the host's loopback.

## Files you OWN

- `bots/discord/src/commands/ask.ts`, `bots/discord/src/ollama/` (or a new
  `bots/discord/src/wicket/` client replacing the direct Ollama calls)
- `bots/discord/src/env.ts`, `.env.example`, `docs/discord/ask/README.md`

## Files you must NOT touch

- `bots/discord/.env` (production's values). Don't run the bot. The new
  variables in production are the owner's step.

## What to do

1. `/ask` posts the question to Wicket instead of Ollama. `WICKET_URL` and
   `WICKET_TOKEN` replace `OLLAMA_API_KEY`, `OLLAMA_HOST` and `OLLAMA_MODEL`
   in the bot (the key moves to Wicket).
2. While the job waits, the deferred reply shows the ticket line, "You're
   number 14 · now serving 11", and updates as the queue moves (long-poll
   with `?wait=`; edit only when the numbers change). While it runs: "Thinking…".
3. When it's done, the answer replaces the line, as now. If `backup` is true,
   the answer ends with a line saying the backup model answered because the
   main one is unavailable.
4. Failed or cancelled (the owner cleared Wicket's queue, or force-closed the
   job): the private failure path from brief 13, with Wicket's reason.
5. If the interaction is about to expire (Discord allows 15 minutes), cancel
   the job with `DELETE` and tell the member privately.
6. Keep brief 11's per-member limits (one in flight, 30 s apart, three
   messages per answer).

## Acceptance

- Against a stub Wicket in tests: queued → running → done edits the reply
  in that order; `backup: true` adds the note; failed and cancelled answer
  privately; an expiring interaction cancels its job.
- `npm run typecheck` and `npm test` pass.
