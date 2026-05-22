# Ask

`/ask` sends a prompt to an [Ollama Cloud](https://ollama.com/cloud)
model and posts the answer back into the channel.

## Slash command

```
/ask prompt:<text> [model:<name>]
```

- `prompt` — the question / instruction (≤ 1500 chars to fit Discord's option limit).
- `model` — optional override. Defaults to `OLLAMA_MODEL`
  (which itself defaults to `gpt-oss:120b`).

The bot defers the reply, then edits it with the response. Replies longer
than Discord's 2000-character cap are split across follow-up messages.

## Config

Set these in [`bots/discord/.env`](../../../bots/discord/.env.example):

| Var              | Required | Default              | Notes                                      |
| ---------------- | -------- | -------------------- | ------------------------------------------ |
| `OLLAMA_API_KEY` | yes      | —                    | Get one at https://ollama.com/settings/keys |
| `OLLAMA_HOST`    | no       | `https://ollama.com` | Override to point at a self-hosted endpoint |
| `OLLAMA_MODEL`   | no       | `gpt-oss:120b`       | Any model your account / host serves       |

Without `OLLAMA_API_KEY` the rest of the bot still boots; `/ask` itself
replies with a "not configured" message.

## Implementation

- [`bots/discord/src/commands/ask.ts`](../../../bots/discord/src/commands/ask.ts) — Discord-facing slash command.
- [`bots/discord/src/ollama/chat.ts`](../../../bots/discord/src/ollama/chat.ts) — thin `fetch` wrapper around `POST /api/chat`, non-streaming.

The HTTP call has a 60 s timeout via `AbortController`; on timeout or
non-200 response the command edits the deferred reply with a `⚠️ <reason>`
message instead of throwing.
