import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { jukeboxConfig, type JukeboxConfig } from './config.ts';
import {
  JukeboxForbidden,
  JukeboxNotConfigured,
  JukeboxRequestError,
  JukeboxSignInFailed,
  JukeboxUnavailable,
} from './errors.ts';
import { WardSession } from './session.ts';

export {
  JukeboxForbidden,
  JukeboxNotConfigured,
  JukeboxRequestError,
  JukeboxSignInFailed,
  JukeboxUnavailable,
} from './errors.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
/** The Bot account's refresh token between runs. Gitignored with the rest of `data/`. */
export const SESSION_FILE = resolve(here, '../../../data/jukebox-session.json');

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
 * Atrium, called as the Bot account (brief 25). Every request carries the
 * `ward_session` cookie; a 401 gets one refresh-or-login and one retry. Each
 * failure becomes one of the errors in `errors.ts`, so callers decide by type:
 * retry an `Unavailable`, report a `Forbidden` or `SignInFailed` and stop.
 */
export class AtriumClient {
  private readonly fetchImpl: typeof fetch;

  constructor(
    private readonly config: Pick<JukeboxConfig, 'atriumUrl'>,
    readonly session: WardSession,
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
      const token = await this.session.accessToken();
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
            cookie: `ward_session=${token}`,
          },
          body: json === undefined ? undefined : JSON.stringify(json),
          signal: signal ? AbortSignal.any([signal, timeout.signal]) : timeout.signal,
        });
      } catch (err) {
        done();
        if (signal?.aborted) throw err;
        throw new JukeboxUnavailable(`atrium did not answer ${path} (${(err as Error).message})`);
      }

      if (response.ok) return { response, done };
      const code = ((await response.json().catch(() => ({}))) as { error?: string }).error;
      done();
      if (response.status === 401) {
        // An expired or revoked session. One refresh (or login) and one retry;
        // a second 401 is not something another attempt fixes now.
        this.session.invalidate();
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

let shared: AtriumClient | undefined;

/** The one client the bot uses. Throws `JukeboxNotConfigured` when the four variables are unset. */
export function atrium(): AtriumClient {
  if (shared) return shared;
  const config = jukeboxConfig();
  if (!config) throw new JukeboxNotConfigured();
  shared = new AtriumClient(config, new WardSession({ ...config, storeFile: SESSION_FILE }));
  return shared;
}

/** `GET`/`POST` atrium and parse the JSON answer, as the Bot account. */
export function atriumFetch<T>(path: string, init?: AtriumInit): Promise<T> {
  return atrium().json<T>(path, init);
}

/** Atrium's raw response as the Bot account, for a body to stream. */
export function atriumStream(path: string, init?: AtriumInit): Promise<Response> {
  return atrium().stream(path, init);
}

/** True when an error means "stop and tell the owner" rather than "try again later". */
export function isPermanentJukeboxError(err: unknown): boolean {
  return err instanceof JukeboxNotConfigured || err instanceof JukeboxSignInFailed || err instanceof JukeboxForbidden;
}
