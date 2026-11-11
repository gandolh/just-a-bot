/**
 * Wicket, the estate's one queue for LLM calls: it holds the Ollama Cloud key,
 * runs one call at a time and gives every call a ticket. The bot never talks
 * to Ollama itself. No env here, so the client is tested against a stub.
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export type JobStatus = "queued" | "running" | "done" | "failed" | "cancelled";

/** A job as Wicket reports it. `position` 1 runs next; 0 once it runs. */
export interface WicketJob {
  id: string;
  ticket: number;
  nowServing: number;
  position: number;
  status: JobStatus;
  /** On `done` only. */
  result?: { text: string; model: string };
  /** On `failed`, why; on `cancelled`, who or what cancelled it. Never the prompt. */
  error?: string;
}

/** A refusal or an unreachable Wicket, with the reason a member can read. */
export class WicketError extends Error {}

export interface WicketClient {
  /** Join the queue. Only `messages` goes in the body: Wicket answers 400 to any other field. */
  submit(messages: ChatMessage[]): Promise<WicketJob>;
  /**
   * The job now, or after up to `waitSeconds` (at most 25) as soon as it
   * changes. `undefined` when Wicket no longer knows it: it restarted, or the
   * answer was older than 10 minutes. Either way the job is gone.
   */
  get(id: string, waitSeconds: number): Promise<WicketJob | undefined>;
  /** Cancel the bot's own job. A finished job stays as it was. */
  cancel(id: string): Promise<void>;
}

/** Longest `?wait=` Wicket honours. */
export const MAX_WAIT_SECONDS = 25;

/** Slack on top of a long-poll before the request counts as hung. */
const REQUEST_SLACK_MS = 15_000;

export function wicketClient({
  url,
  token,
  fetch = globalThis.fetch,
}: {
  url: string;
  token: string;
  fetch?: typeof globalThis.fetch;
}): WicketClient {
  const base = url.replace(/\/+$/, "");
  const headers = { authorization: `Bearer ${token}` };

  async function call(method: string, path: string, timeoutMs: number, body?: unknown): Promise<Response> {
    try {
      return await fetch(`${base}${path}`, {
        method,
        headers: body === undefined ? headers : { ...headers, "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      const timedOut = err instanceof Error && err.name === "TimeoutError";
      throw new WicketError(timedOut ? "Wicket did not answer in time." : "Could not reach Wicket.", { cause: err });
    }
  }

  async function refused(res: Response): Promise<WicketError> {
    const body = (await res.json().catch(() => undefined)) as { code?: string; message?: string } | undefined;
    if (res.status === 503 && body?.code === "queue_full") {
      return new WicketError("The queue is full right now. Try again in a few minutes.");
    }
    return new WicketError(`Wicket answered ${res.status}${body?.message ? `: ${body.message}` : ""}`);
  }

  return {
    async submit(messages) {
      const res = await call("POST", "/v1/jobs", REQUEST_SLACK_MS, { messages });
      if (res.status !== 202) throw await refused(res);
      return (await res.json()) as WicketJob;
    },

    async get(id, waitSeconds) {
      const wait = Math.max(0, Math.min(MAX_WAIT_SECONDS, Math.floor(waitSeconds)));
      const res = await call(
        "GET",
        `/v1/jobs/${encodeURIComponent(id)}${wait > 0 ? `?wait=${wait}` : ""}`,
        wait * 1000 + REQUEST_SLACK_MS,
      );
      if (res.status === 404) return undefined;
      if (!res.ok) throw await refused(res);
      return (await res.json()) as WicketJob;
    },

    async cancel(id) {
      const res = await call("DELETE", `/v1/jobs/${encodeURIComponent(id)}`, REQUEST_SLACK_MS);
      if (!res.ok && res.status !== 404) throw await refused(res);
    },
  };
}
