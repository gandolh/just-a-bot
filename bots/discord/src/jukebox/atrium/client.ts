import { jukeboxConfig } from './config.ts';
import { JukeboxForbidden, JukeboxNotConfigured, JukeboxSignInFailed } from './errors.ts';
import { AtriumClient, type AtriumInit } from './request.ts';
import { AtriumSession } from './session.ts';

export {
  JukeboxForbidden,
  JukeboxNotConfigured,
  JukeboxRequestError,
  JukeboxSignInFailed,
  JukeboxUnavailable,
} from './errors.ts';
export { AtriumClient, type AtriumInit } from './request.ts';
export { clearSpentSessionFile } from './session.ts';

let shared: AtriumClient | undefined;

/** The one client the bot uses. Throws `JukeboxNotConfigured` when the three variables are unset. */
export function atrium(): AtriumClient {
  if (shared) return shared;
  const config = jukeboxConfig();
  if (!config) throw new JukeboxNotConfigured();
  shared = new AtriumClient(config, new AtriumSession(config));
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
