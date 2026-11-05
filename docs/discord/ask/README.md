# Ask

`/ask` sends a prompt to Wicket, the estate's one queue for LLM calls, and
posts the answer back into the channel. Wicket holds the
[Ollama Cloud](https://ollama.com/cloud) key, runs one call at a time for
every app that asks, and picks the model; members don't choose.

## Slash command

```
/ask prompt:<text>
```

- `prompt` — the question / instruction (≤ 1500 chars to fit Discord's option limit).

The bot defers the reply publicly, then keeps it in step with Wicket's queue:

1. While the question waits, the reply shows its ticket, like a market
   counter: `You're number 14 · now serving 11`. It is edited only when the
   numbers change.
2. While the model works on it: `Thinking…`.
3. Then the answer replaces the line. An answer longer than Discord's
   2000-character cap continues in follow-up messages, at most two; past
   that it is cut and the last message says so.

If the question fails, the bot deletes the public placeholder and tells only
the member why, in an ephemeral `⚠️ <reason>` message. Nothing is left in
the channel. That covers:

- the model failing (Wicket's reason, such as a spent quota or its 120 s
  limit);
- the question cancelled in Wicket (the owner cleared the queue or force
  closed it);
- Wicket refusing it (the queue is full at 200 waiting) or not answering;
- Wicket forgetting it (a restart);
- a question still waiting after 14 minutes. Discord stops accepting edits
  to an interaction after 15, so the bot withdraws the job from Wicket first
  and then tells the member.

Each member may have one question in flight and must wait 30 seconds
between questions (in memory, so a restart resets it). Both refusals answer
only the member. The 30 s count from when the question was asked, whether
it was answered or failed.

## Config

Set these in [`bots/discord/.env`](../../../bots/discord/.env.example):

| Var            | Required | Notes |
| -------------- | -------- | ----- |
| `WICKET_URL`   | yes      | Wicket's API base, `https://<domain>/wicket-api`. Use the public address on the VPS too: a container can't reach the host's loopback. |
| `WICKET_TOKEN` | yes      | The bot's own token, its pair in Wicket's `WICKET_APP_TOKENS` (in vps-deploy's `secrets/wicket.env`). |

Without either, the rest of the bot still boots; `/ask` itself replies with a
"not configured" message naming what is missing. The old `OLLAMA_API_KEY`,
`OLLAMA_HOST`, `OLLAMA_MODEL` and `OLLAMA_MODELS` are ignored if still in
`.env`.

## Implementation

- [`bots/discord/src/commands/ask.ts`](../../../bots/discord/src/commands/ask.ts) — Discord-facing slash command: config, limits, the deferred reply.
- [`bots/discord/src/ask/answer.ts`](../../../bots/discord/src/ask/answer.ts) — one question from submit to answer: the ticket line, the long-poll, the private failures, the 14-minute withdrawal.
- [`bots/discord/src/wicket/client.ts`](../../../bots/discord/src/wicket/client.ts) — the Wicket API: `POST /v1/jobs`, `GET /v1/jobs/:id?wait=25`, `DELETE /v1/jobs/:id`.
- [`bots/discord/src/ask/limits.ts`](../../../bots/discord/src/ask/limits.ts) — the per-member in-flight and cooldown rules.
- [`bots/discord/src/ask/reply.ts`](../../../bots/discord/src/ask/reply.ts) — splitting an answer into at most three messages, and the private failure message.

Wicket's own API page is in its repo, `corpus/wiki/api.md`.

## Triage

A failure no longer shows in the channel, so look in the bot's log. Each
one is a `[WARN] [ask] /ask <outcome>: <reason>` line, where the outcome is
`failed`, `cancelled`, `expired` or `lost`. An
`[ERROR] [ask] Could not delete the deferred /ask reply` line means the
public placeholder may still be in the channel. What Wicket did with a
question (its ticket, wait and run time) is on Wicket's page at `/wicket`.
