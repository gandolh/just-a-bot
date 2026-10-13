import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from '@bots/shared';
import { JukeboxSignInFailed, JukeboxUnavailable } from './errors.ts';

const log = logger.scoped('jukebox');

/**
 * The Bot account's session on atrium, without a browser (brief 29).
 *
 * Atrium has its own accounts. The bot logs in with `POST /auth/login` and
 * atrium answers with one cookie, `atrium_session` (14 days idle, sliding, and
 * 30 days absolute). Everything here follows from that:
 *
 * - **The cookie lives in memory only.** There is nothing to protect on disk:
 *   a restart costs one login, and a login that succeeds spends none of
 *   atrium's lockout slots. (Ward's rotating refresh token was the reason the
 *   old session was saved to a file; there is no such token any more.)
 * - **A 401 means the session is gone** (expired, revoked, or atrium forgot
 *   it): the client calls `invalidate()`, and the next caller logs in again.
 *   Logging in is single-flight, so a burst of 401s makes one login.
 * - **Atrium re-sends the cookie** at most hourly while the session is in use.
 *   `noteResponse()` picks the new value up.
 * - **A refused password is tried once**, and not again until a restart: atrium
 *   locks an address out after five failed logins.
 * - **No `Origin` header.** Atrium's cross-site guard lets a request without
 *   one through and refuses a wrong one. Node's fetch sends none.
 */

const here = fileURLToPath(new URL('.', import.meta.url));
/** Ward's refresh token, saved by briefs 25-28. Spent since brief 29: the session is atrium's own and lives in memory. */
const SPENT_SESSION_FILE = resolve(here, '../../../data/jukebox-session.json');

/** Delete the spent `jukebox-session.json`, if an older run left one. Best effort; never throws. */
export async function clearSpentSessionFile(file = SPENT_SESSION_FILE): Promise<void> {
  await rm(file, { force: true }).catch(() => undefined);
}

const BACKOFF_FIRST_MS = 2_000;
const BACKOFF_MAX_MS = 60_000;
const LOGIN_TIMEOUT_MS = 10_000;
/** The cookie atrium sets. */
export const SESSION_COOKIE = 'atrium_session';

/** The `atrium_session` value out of `Set-Cookie` headers. A cleared cookie (empty value) is not one. */
export function parseSessionCookie(setCookie: readonly string[]): string | undefined {
  let found: string | undefined;
  for (const header of setCookie) {
    const pair = header.split(';', 1)[0];
    const eq = pair.indexOf('=');
    if (eq === -1) continue;
    if (pair.slice(0, eq).trim() !== SESSION_COOKIE) continue;
    const value = pair.slice(eq + 1).trim();
    if (value) found = value;
  }
  return found;
}

export interface AtriumSessionOptions {
  /** Atrium's API root, e.g. `https://example.com/atrium-api`. */
  atriumUrl: string;
  username: string;
  password: string;
  /** Test seams. */
  fetch?: typeof fetch;
  now?: () => number;
}

export class AtriumSession {
  private cookieValue: string | null = null;
  /** Set once a login is refused for good. Nothing contacts atrium to log in again until a restart. */
  private failed: string | null = null;
  /** Atrium is not asked to log in before this (a 429's wait, or the network backoff). */
  private notBefore = 0;
  private backoffMs = 0;
  private inFlight: Promise<string> | null = null;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;

  /** How many logins succeeded. The check script prints it. */
  logins = 0;

  constructor(private readonly options: AtriumSessionOptions) {
    this.fetchImpl = options.fetch ?? fetch;
    this.now = options.now ?? Date.now;
  }

  /** True after a refused login: the owner has to fix the credentials and restart. */
  get signInFailed(): boolean {
    return this.failed !== null;
  }

  /** The `Cookie` header value for atrium, logging in first if there is no session. Concurrent callers share one login. */
  async cookie(): Promise<string> {
    if (this.failed) throw new JukeboxSignInFailed(this.failed);
    if (this.cookieValue) return `${SESSION_COOKIE}=${this.cookieValue}`;
    const value = await (this.inFlight ??= this.login().finally(() => {
      this.inFlight = null;
    }));
    return `${SESSION_COOKIE}=${value}`;
  }

  /**
   * Atrium said 401 to a request that carried `sentCookie`: forget the session
   * so the next call logs in. If another caller has already replaced it, the
   * newer session stays.
   */
  invalidate(sentCookie?: string): void {
    if (sentCookie === undefined || sentCookie === `${SESSION_COOKIE}=${this.cookieValue}`) this.cookieValue = null;
  }

  /** Keep a renewed `atrium_session` if atrium sent one with this response. */
  noteResponse(res: Response): void {
    const renewed = parseSessionCookie(res.headers.getSetCookie());
    if (renewed && this.cookieValue) this.cookieValue = renewed;
  }

  /** Log out at atrium (204) and forget the session. Best effort: the check script uses it to tidy up. */
  async logout(): Promise<void> {
    const sent = this.cookieValue;
    this.cookieValue = null;
    if (!sent) return;
    try {
      await this.fetchImpl(`${this.options.atriumUrl}/auth/logout`, {
        method: 'POST',
        headers: { accept: 'application/json', cookie: `${SESSION_COOKIE}=${sent}` },
        signal: AbortSignal.timeout(LOGIN_TIMEOUT_MS),
      }).then((res) => res.body?.cancel());
    } catch {
      // The session simply expires on its own.
    }
  }

  /** Throw while a 429 or the network backoff says to wait. */
  private gate(): void {
    const wait = this.notBefore - this.now();
    if (wait > 0) throw new JukeboxUnavailable(`waiting ${Math.ceil(wait / 1000)} s before asking atrium to sign in again`);
  }

  private backOff(reason: string): never {
    this.backoffMs = this.backoffMs === 0 ? BACKOFF_FIRST_MS : Math.min(this.backoffMs * 2, BACKOFF_MAX_MS);
    this.notBefore = this.now() + this.backoffMs;
    throw new JukeboxUnavailable(`${reason}; trying again in ${this.backoffMs / 1000} s`);
  }

  private async login(): Promise<string> {
    this.gate();
    const { username, password, atriumUrl } = this.options;
    let res: Response;
    try {
      res = await this.fetchImpl(`${atriumUrl}/auth/login`, {
        method: 'POST',
        // No Origin: atrium lets an Origin-less request through on purpose, and
        // refuses one that is not its own.
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ username, password }),
        signal: AbortSignal.timeout(LOGIN_TIMEOUT_MS),
      });
    } catch (err) {
      return this.backOff(`atrium did not answer /auth/login (${(err as Error).message})`);
    }

    if (res.ok) {
      const cookie = parseSessionCookie(res.headers.getSetCookie());
      await res.body?.cancel();
      if (!cookie) return this.backOff(`atrium's login answered ${res.status} without an ${SESSION_COOKIE} cookie`);
      this.cookieValue = cookie;
      this.backoffMs = 0;
      this.notBefore = 0;
      this.logins += 1;
      log.info(`signed in to atrium as ${username}`);
      return cookie;
    }

    const body = (await res.json().catch(() => ({}))) as { error?: string; retryAfterSeconds?: unknown };
    const code = body.error;
    if (res.status === 429) {
      const fromBody = Number(body.retryAfterSeconds);
      const seconds = fromBody > 0 ? Math.ceil(fromBody) : Number(res.headers.get('retry-after')) || 60;
      this.notBefore = this.now() + seconds * 1000;
      throw new JukeboxUnavailable(`atrium is rate-limiting sign-ins; waiting ${seconds} s`);
    }
    if (res.status >= 500) return this.backOff(`atrium's login failed with ${res.status}`);
    // 401 invalid_credentials, a 400 the request itself caused, or a 403
    // cross_site. None gets better by asking again, and every failed login
    // spends one of atrium's five lockout slots, so stop until a restart.
    this.failed =
      res.status === 403 && code === 'cross_site'
        ? `atrium refused the sign-in as cross-site (403): something is adding an Origin header, check JUKEBOX_ATRIUM_URL, then restart the bot`
        : `atrium refused the sign-in for JUKEBOX_ATRIUM_USERNAME=${username} (${res.status}${code ? ` ${code}` : ''}); check JUKEBOX_ATRIUM_USERNAME and JUKEBOX_ATRIUM_PASSWORD, then restart the bot`;
    log.error(`Jukebox sign-in failed: ${this.failed}`);
    throw new JukeboxSignInFailed(this.failed);
  }
}
