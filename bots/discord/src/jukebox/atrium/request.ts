import {
  JukeboxForbidden,
  JukeboxRequestError,
  JukeboxUnavailable,
} from './errors.ts';
import type { AtriumSession } from './session.ts';

const DEFAULT_TIMEOUT_MS = 10_000;

export interface AtriumInit extends Omit<RequestInit, 'signal' | 'body'> {
  /** JSON-encoded and sent with a JSON content type. */
  json?: unknown;
  /**
   * How long to wait for atrium. For `json()` it covers the whole body; for
   * `stream()` only the headers, so a long download is never cut off. The
   * long-poll passes its `wait` plus a margin.
   */
  timeoutMs?: number;
  /** The caller's own cancellation, on top of the timeout. */
  signal?: AbortSignal;
}

/**
 * Atrium, called as the Bot account (briefs 25 and 29). Every request carries
 * the `atrium_session` cookie; a 401 gets one new login and one retry. A
 * renewed cookie in any response replaces the old one. Each
 * failure becomes one of the errors in `errors.ts`, so callers decide by type:
 * retry an `Unavailable`, report a `Forbidden` or `SignInFailed` and stop.
 */
export class AtriumClient {
  private readonly fetchImpl: typeof fetch;

  constructor(
    private readonly config: { atriumUrl: string },
    readonly session: AtriumSession,
    fetchImpl?: typeof fetch,
  ) {
    this.fetchImpl = fetchImpl ?? fetch;
  }

  /** A JSON response body. */
  async json<T>(path: string, init: AtriumInit = {}): Promise<T> {
    const { response, done } = await this.request(path, init);
    try {
      return (await response.json()) as T;
    } catch (err) {
      throw new JukeboxUnavailable(`atrium's answer to ${path} did not arrive whole (${(err as Error).message})`);
    } finally {
      done();
    }
  }

  /** The raw response, for a body to stream (a Track's file into ffmpeg). The caller reads or cancels it. */
  async stream(path: string, init: AtriumInit = {}): Promise<Response> {
    const { response, done } = await this.request(path, init);
    done();
    return response;
  }

  private async request(path: string, init: AtriumInit): Promise<{ response: Response; done: () => void }> {
    const { json, timeoutMs = DEFAULT_TIMEOUT_MS, signal, headers, ...rest } = init;
    for (let attempt = 0; ; attempt++) {
      const cookie = await this.session.cookie();
      const timeout = new AbortController();
      const timer = setTimeout(() => timeout.abort(new Error(`no answer in ${timeoutMs} ms`)), timeoutMs);
      const done = () => clearTimeout(timer);
      let response: Response;
      try {
        response = await this.fetchImpl(`${this.config.atriumUrl}${path}`, {
          ...rest,
          headers: {
            accept: 'application/json',
            ...(json === undefined ? {} : { 'content-type': 'application/json' }),
            ...(headers as Record<string, string> | undefined),
            cookie,
          },
          body: json === undefined ? undefined : JSON.stringify(json),
          signal: signal ? AbortSignal.any([signal, timeout.signal]) : timeout.signal,
        });
      } catch (err) {
        done();
        if (signal?.aborted) throw err;
        throw new JukeboxUnavailable(`atrium did not answer ${path} (${(err as Error).message})`);
      }

      this.session.noteResponse(response);
      if (response.ok) return { response, done };
      const code = ((await response.json().catch(() => ({}))) as { error?: string }).error;
      done();
      if (response.status === 401) {
        // An expired or revoked session. One new login and one retry; a
        // second 401 is not something another attempt fixes now.
        this.session.invalidate(cookie);
        if (attempt === 0) continue;
        throw new JukeboxUnavailable(`atrium refused the Bot account's session twice for ${path}`);
      }
      if (response.status === 403) throw new JukeboxForbidden(code);
      if (response.status === 503 || response.status >= 500) {
        throw new JukeboxUnavailable(`atrium answered ${response.status}${code ? ` ${code}` : ''} for ${path}`);
      }
      throw new JukeboxRequestError(response.status, code);
    }
  }
}
