/**
 * What can go wrong talking to atrium, sorted by what the caller should do
 * about it. `/jukebox` turns each into a reply in Discord.
 */

/** The three `JUKEBOX_*` variables are unset. Not an error in the bot: the Jukebox is off. */
export class JukeboxNotConfigured extends Error {
  constructor() {
    super("the Jukebox is not configured: set the three JUKEBOX_* variables");
    this.name = "JukeboxNotConfigured";
  }
}

/** Atrium refused the Bot account's username or password. Fixed by the owner, then a restart. */
export class JukeboxSignInFailed extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JukeboxSignInFailed";
  }
}

/** Atrium is down, slow, rate-limiting sign-ins or unreachable. Back off and try again. */
export class JukeboxUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JukeboxUnavailable";
  }
}

/** A 403 from atrium: the account's grant is wrong (`JUKEBOX_ROLE_FORBIDDEN`). Configuration, so never retried. */
export class JukeboxForbidden extends Error {
  readonly code: string | undefined;

  constructor(code: string | undefined) {
    super(`atrium refused the Bot account (${code ?? "no code"})`);
    this.code = code;
    this.name = "JukeboxForbidden";
  }
}

/** Any other refusal from atrium, with its `{error}` code (`PLAYER_OFFLINE`, `NOT_A_TRACK`, ...). */
export class JukeboxRequestError extends Error {
  readonly status: number;
  readonly code: string | undefined;

  constructor(status: number, code: string | undefined) {
    super(`atrium answered ${status}${code ? ` ${code}` : ""}`);
    this.status = status;
    this.code = code;
    this.name = "JukeboxRequestError";
  }
}
