# Ask

`/ask` sends a prompt to an [Ollama Cloud](https://ollama.com/cloud)
model and posts the answer back into the channel. Every question goes to
the one model in `OLLAMA_MODEL`; members don't choose.

## Slash command

```
/ask prompt:<text>
```

- `prompt` — the question / instruction (≤ 1500 chars to fit Discord's option limit).

The bot defers the reply publicly, then edits it with the answer. An answer
longer than Discord's 2000-character cap continues in follow-up messages,
at most two; past that it is cut and the last message says so.

If the call fails (Ollama returns an error, the 60 s timeout runs out, the
quota is used up), the bot deletes the public "thinking" placeholder and
tells only the member why, in an ephemeral `⚠️ <reason>` message. Nothing
is left in the channel.

Each member may have one question in flight and must wait 30 seconds
between questions (in memory, so a restart resets it). Both refusals answer
only the member. The 30 s count from when the question was asked, whether
it was answered or failed.

## Config

Set these in [`bots/discord/.env`](../../../bots/discord/.env.example):

| Var              | Required | Default              | Notes                                      |
| ---------------- | -------- | -------------------- | ------------------------------------------ |
| `OLLAMA_API_KEY` | yes      | —                    | Get one at https://ollama.com/settings/keys |
| `OLLAMA_HOST`    | no       | `https://ollama.com` | Override to point at a self-hosted endpoint |
| `OLLAMA_MODEL`   | no       | `gpt-oss:120b`       | The one model `/ask` uses; any model your account / host serves |

Without `OLLAMA_API_KEY` the rest of the bot still boots; `/ask` itself
replies with a "not configured" message.

## Implementation

- [`bots/discord/src/commands/ask.ts`](../../../bots/discord/src/commands/ask.ts) — Discord-facing slash command.
- [`bots/discord/src/ollama/chat.ts`](../../../bots/discord/src/ollama/chat.ts) — thin `fetch` wrapper around `POST /api/chat`, non-streaming.
- [`bots/discord/src/ollama/limits.ts`](../../../bots/discord/src/ollama/limits.ts) — the per-member in-flight and cooldown rules.
- [`bots/discord/src/ollama/reply.ts`](../../../bots/discord/src/ollama/reply.ts) — splitting an answer into at most three messages, and the private failure message.

The HTTP call has a 60 s timeout via `AbortController`. On a timeout or a
non-200 response the command doesn't throw: it deletes the deferred reply
and sends the member an ephemeral `⚠️ <reason>`.

## Triage

A failure no longer shows in the channel, so look in the bot's log. Each
one is a `[WARN] [ask] /ask failed: <reason>` line, with the error attached
when it was neither Ollama's own error nor the timeout. An
`[ERROR] [ask] Could not delete the deferred /ask reply` line means the
public placeholder may still be in the channel.

A leftover `OLLAMA_MODELS` in `.env` is ignored; it was read only until
2026-11-04.
