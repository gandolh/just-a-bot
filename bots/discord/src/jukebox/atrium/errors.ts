/**
 * What can go wrong talking to atrium, sorted by what the caller should do
 * about it (brief 25). Brief 27 turns each into a reply in Discord.
 */

/** The four `JUKEBOX_*` variables are unset. Not an error in the bot: the Jukebox is off. */
export class JukeboxNotConfigured extends Error {
  constructor() {
    super('the Jukebox is not configured: set the four JUKEBOX_* variables');
    this.name = 'JukeboxNotConfigured';
  }
}

/** Ward refused the Bot account's username or password, or the account is disabled. Fixed by the owner, then a restart. */
export class JukeboxSignInFailed extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JukeboxSignInFailed';
  }
}

/** Ward or atrium is down, slow or unreachable. Back off and try again. */
export class JukeboxUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JukeboxUnavailable';
  }
}

/** A 403 from atrium: the account's grant is wrong (`NO_ATRIUM_GRANT`, `JUKEBOX_ROLE_FORBIDDEN`). Configuration, so never retried. */
export class JukeboxForbidden extends Error {
  constructor(readonly code: string | undefined) {
    super(`atrium refused the Bot account (${code ?? 'no code'})`);
    this.name = 'JukeboxForbidden';
  }
}

/** Any other refusal from atrium, with its `{error}` code (`PLAYER_OFFLINE`, `NOT_A_TRACK`, ...). */
export class JukeboxRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
  ) {
    super(`atrium answered ${status}${code ? ` ${code}` : ''}`);
    this.name = 'JukeboxRequestError';
  }
}
