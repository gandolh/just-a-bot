# Ask

`/ask` sends a prompt to an [Ollama Cloud](https://ollama.com/cloud)
model and posts the answer back into the channel.

## Slash command

```
/ask prompt:<text> [model:<name>]
```

- `prompt` — the question / instruction (≤ 1500 chars to fit Discord's option limit).
- `model` — optional, picked from a list: `OLLAMA_MODEL` (the default, which
  itself defaults to `gpt-oss:120b`) and whatever `OLLAMA_MODELS` adds. Any
  other name is refused, so members cannot spend the key on a model the owner
  did not offer.

The bot defers the reply, then edits it with the response. An answer longer
than Discord's 2000-character cap continues in follow-up messages, at most
two; past that it is cut and the last message says so.

Each member may have one question in flight and must wait 30 seconds
between questions (in memory, so a restart resets it). Both refusals answer
only the member.

## Config

Set these in [`bots/discord/.env`](../../../bots/discord/.env.example):

| Var              | Required | Default              | Notes                                      |
| ---------------- | -------- | -------------------- | ------------------------------------------ |
| `OLLAMA_API_KEY` | yes      | —                    | Get one at https://ollama.com/settings/keys |
| `OLLAMA_HOST`    | no       | `https://ollama.com` | Override to point at a self-hosted endpoint |
| `OLLAMA_MODEL`   | no       | `gpt-oss:120b`       | Any model your account / host serves       |
| `OLLAMA_MODELS`  | no       | —                    | More models to offer, comma-separated. Up to 25 in all; re-register the commands after a change |

Without `OLLAMA_API_KEY` the rest of the bot still boots; `/ask` itself
replies with a "not configured" message.

## Implementation

- [`bots/discord/src/commands/ask.ts`](../../../bots/discord/src/commands/ask.ts) — Discord-facing slash command.
- [`bots/discord/src/ollama/chat.ts`](../../../bots/discord/src/ollama/chat.ts) — thin `fetch` wrapper around `POST /api/chat`, non-streaming.
- [`bots/discord/src/ollama/limits.ts`](../../../bots/discord/src/ollama/limits.ts) — the model list, and the per-member in-flight and cooldown rules.
- [`bots/discord/src/ollama/reply.ts`](../../../bots/discord/src/ollama/reply.ts) — splitting an answer into at most three messages.

The HTTP call has a 60 s timeout via `AbortController`; on timeout or
non-200 response the command edits the deferred reply with a `⚠️ <reason>`
message instead of throwing.
