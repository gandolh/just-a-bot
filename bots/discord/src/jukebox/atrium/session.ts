import { readFile } from 'node:fs/promises';
import { logger, writeJsonFile } from '@bots/shared';
import { JukeboxSignInFailed, JukeboxUnavailable } from './errors.ts';

const log = logger.scoped('jukebox');

/**
 * The Bot account's Ward session, without a browser (brief 25).
 *
 * Ward hands out two tokens, and only as `Set-Cookie`: `ward_session`, the
 * 15-minute access token atrium reads, and `ward_refresh`, good for 30 days
 * from the login and never extended. Ward's rules shape everything here:
 *
 * - **A rotated refresh token is spent.** Presenting one again (outside a
 *   10-second grace) revokes the whole session. So the new refresh token is
 *   saved to disk *before* the access token that came with it is used, and
 *   refreshing is single-flight.
 * - **Five failed logins in 15 minutes lock the address out.** A wrong
 *   password is therefore tried once, and not again until a restart.
 * - **`/refresh` refuses a mismatched `Origin`.** Node's fetch sends none,
 *   which is what Ward lets through on purpose.
 *
 * The access token lives in memory only. The refresh token survives restarts
 * in `bots/discord/data/jukebox-session.json`.
 */

/** Refresh this long before the access token runs out. */
export const REFRESH_LEAD_MS = 2 * 60_000;
/** With less than this left on the refresh token, log in afresh rather than rotate it. */
export const RELOGIN_WITHIN_MS = 24 * 60 * 60_000;
const BACKOFF_FIRST_MS = 2_000;
const BACKOFF_MAX_MS = 60_000;
const WARD_TIMEOUT_MS = 10_000;
/** Fallbacks if Ward's body ever omits an expiry: its cookie lifetimes. */
const ACCESS_FALLBACK_MS = 15 * 60_000;
const REFRESH_FALLBACK_MS = 30 * 24 * 60 * 60_000;

interface Token {
  token: string;
  expiresAtMs: number;
}

/** What is saved between runs. */
interface StoredSession {
  username: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
}

/** The two tokens out of a login or refresh response's `Set-Cookie` headers. */
export function parseSessionCookies(setCookie: readonly string[]): { accessToken?: string; refreshToken?: string } {
  const found: { accessToken?: string; refreshToken?: string } = {};
  for (const header of setCookie) {
    const pair = header.split(';', 1)[0];
    const eq = pair.indexOf('=');
    if (eq === -1) continue;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    if (!value) continue;
    if (name === 'ward_session') found.accessToken = value;
    if (name === 'ward_refresh') found.refreshToken = value;
  }
  return found;
}

/**
 * An expiry as epoch milliseconds. Ward sends `accessTokenExpiresAt` as epoch
 * seconds and `refreshTokenExpiresAt` as an ISO string; both are accepted, and
 * a number this small is read as seconds.
 */
export function toEpochMs(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value < 1e12 ? value * 1000 : value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

/**
 * What to do before the next call to atrium: use the access token, refresh,
 * or log in. Refresh two minutes early. Log in afresh when the refresh token
 * has under a day left, because a refresh never extends its 30 days.
 */
export function planSignIn(
  now: number,
  tokens: { access: Token | null; refresh: Token | null },
): 'use' | 'refresh' | 'login' {
  if (tokens.access && now < tokens.access.expiresAtMs - REFRESH_LEAD_MS) return 'use';
  if (tokens.refresh && tokens.refresh.expiresAtMs - now > RELOGIN_WITHIN_MS) return 'refresh';
  return 'login';
}

export interface WardSessionOptions {
  /** Ward's API root, e.g. `https://gandolh.ro/ward-api`. */
  wardUrl: string;
  username: string;
  password: string;
  /** Where the refresh token is kept between runs. */
  storeFile: string;
  /** Test seams. */
  fetch?: typeof fetch;
  now?: () => number;
}

export class WardSession {
  private access: Token | null = null;
  private refresh: Token | null = null;
  private loaded = false;
  /** Set once a login is refused for good. Nothing contacts Ward again until a restart. */
  private failed: string | null = null;
  /** Ward is not asked again before this (a 429's `Retry-After`, or the network backoff). */
  private notBefore = 0;
  private backoffMs = 0;
  private inFlight: Promise<string> | null = null;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;

  /** How the current access token was obtained. The check script prints it. */
  lastSignIn: 'login' | 'refresh' | null = null;

  constructor(private readonly options: WardSessionOptions) {
    this.fetchImpl = options.fetch ?? fetch;
    this.now = options.now ?? Date.now;
  }

  /** True after a refused login: the owner has to fix the credentials and restart. */
  get signInFailed(): boolean {
    return this.failed !== null;
  }

  /** A live access token, refreshing or logging in first if needed. Concurrent callers share one attempt. */
  async accessToken(): Promise<string> {
    if (this.failed) throw new JukeboxSignInFailed(this.failed);
    if (this.access && planSignIn(this.now(), { access: this.access, refresh: this.refresh }) === 'use') {
      return this.access.token;
    }
    return this.single(() => this.obtain());
  }

  /** Atrium said 401: forget the access token, so the next call refreshes or logs in. */
  invalidate(): void {
    this.access = null;
  }

  /** Rotate now, whatever the access token's age (the check script). Logs in if there is nothing to rotate. */
  async forceRefresh(): Promise<void> {
    if (this.failed) throw new JukeboxSignInFailed(this.failed);
    await this.single(async () => {
      await this.load();
      this.gate();
      if (this.refresh && (await this.rotate())) return this.access!.token;
      await this.login();
      return this.access!.token;
    });
  }

  private single(work: () => Promise<string>): Promise<string> {
    this.inFlight ??= work().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async obtain(): Promise<string> {
    await this.load();
    this.gate();
    const step = planSignIn(this.now(), { access: this.access, refresh: this.refresh });
    if (step === 'use') return this.access!.token;
    if (step === 'refresh' && (await this.rotate())) return this.access!.token;
    await this.login();
    return this.access!.token;
  }

  /** Throw while a 429 or the network backoff says to wait. */
  private gate(): void {
    const wait = this.notBefore - this.now();
    if (wait > 0) throw new JukeboxUnavailable(`waiting ${Math.ceil(wait / 1000)} s before asking Ward again`);
  }

  private backOff(reason: string): never {
    this.backoffMs = this.backoffMs === 0 ? BACKOFF_FIRST_MS : Math.min(this.backoffMs * 2, BACKOFF_MAX_MS);
    this.notBefore = this.now() + this.backoffMs;
    throw new JukeboxUnavailable(`${reason}; trying again in ${this.backoffMs / 1000} s`);
  }

  /** The saved refresh token, if it belongs to the configured account. Read once. */
  private async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    let saved: Partial<StoredSession>;
    try {
      saved = JSON.parse(await readFile(this.options.storeFile, 'utf8')) as Partial<StoredSession>;
    } catch {
      return; // No file yet, or an unreadable one: log in.
    }
    const expiresAtMs = toEpochMs(saved.refreshTokenExpiresAt);
    if (saved.username === this.options.username && typeof saved.refreshToken === 'string' && expiresAtMs) {
      this.refresh = { token: saved.refreshToken, expiresAtMs };
    }
  }

  private async post(path: string, body: unknown): Promise<Response> {
    try {
      return await this.fetchImpl(`${this.options.wardUrl}${path}`, {
        method: 'POST',
        // No Origin: Ward lets an Origin-less request through on purpose, and
        // refuses one that is not its own.
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(WARD_TIMEOUT_MS),
      });
    } catch (err) {
      return this.backOff(`Ward did not answer ${path} (${(err as Error).message})`);
    }
  }

  /** Save the refresh token, then take the access token. In that order, always. */
  private async adopt(res: Response, how: 'login' | 'refresh'): Promise<void> {
    const cookies = parseSessionCookies(res.headers.getSetCookie());
    const body = (await res.json().catch(() => ({}))) as { accessTokenExpiresAt?: unknown; refreshTokenExpiresAt?: unknown };
    if (!cookies.accessToken || !cookies.refreshToken) {
      return this.backOff(`Ward's ${how} answered 200 without both session cookies`);
    }
    const now = this.now();
    const refresh = {
      token: cookies.refreshToken,
      expiresAtMs: toEpochMs(body.refreshTokenExpiresAt) ?? now + REFRESH_FALLBACK_MS,
    };
    const stored: StoredSession = {
      username: this.options.username,
      refreshToken: refresh.token,
      refreshTokenExpiresAt: new Date(refresh.expiresAtMs).toISOString(),
    };
    await writeJsonFile(this.options.storeFile, `${JSON.stringify(stored, null, 2)}\n`);
    this.refresh = refresh;
    this.access = {
      token: cookies.accessToken,
      expiresAtMs: toEpochMs(body.accessTokenExpiresAt) ?? now + ACCESS_FALLBACK_MS,
    };
    this.backoffMs = 0;
    this.notBefore = 0;
    this.lastSignIn = how;
  }

  /** Rotate the refresh token. False when Ward no longer honours it, so the caller logs in. */
  private async rotate(): Promise<boolean> {
    const res = await this.post('/refresh', { refreshToken: this.refresh!.token });
    if (res.ok) {
      await this.adopt(res, 'refresh');
      return true;
    }
    await res.body?.cancel();
    if (res.status >= 500) return this.backOff(`Ward's refresh failed with ${res.status}`);
    // 401 invalid_refresh (expired, revoked, or reused), or anything else Ward
    // refuses: this token is done. A login starts a new session.
    log.warn(`Ward refused the saved refresh token (${res.status}); signing in again`);
    this.refresh = null;
    this.access = null;
    return false;
  }

  private async login(): Promise<void> {
    const { username, password } = this.options;
    const res = await this.post('/login', { username, password });
    if (res.ok) {
      await this.adopt(res, 'login');
      log.info(`signed in to Ward as ${username}`);
      return;
    }
    const code = ((await res.json().catch(() => ({}))) as { error?: string }).error;
    if (res.status === 429) {
      const seconds = Number(res.headers.get('retry-after')) || 60;
      this.notBefore = this.now() + seconds * 1000;
      throw new JukeboxUnavailable(`Ward is rate-limiting sign-ins; waiting ${seconds} s`);
    }
    if (res.status >= 500) return this.backOff(`Ward's login failed with ${res.status}`);
    // 401 invalid_credentials, 403 account_disabled, or a 400 the request
    // itself caused. None gets better by asking again, and every failed login
    // spends one of Ward's five lockout slots, so stop until a restart.
    this.failed =
      res.status === 403 && code === 'account_disabled'
        ? `Ward says the account JUKEBOX_WARD_USERNAME=${username} is disabled`
        : `Ward refused the sign-in for JUKEBOX_WARD_USERNAME=${username} (${res.status}${code ? ` ${code}` : ''}); check JUKEBOX_WARD_USERNAME and JUKEBOX_WARD_PASSWORD, then restart the bot`;
    log.error(`Jukebox sign-in failed: ${this.failed}`);
    throw new JukeboxSignInFailed(this.failed);
  }
}
