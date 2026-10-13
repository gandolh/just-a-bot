/**
 * The Jukebox's three variables are optional, but all or none (briefs 25 and
 * 29): two of three is a half-finished setup, and failing fast on boot names
 * what is missing instead of leaving the bot to discover it at the first
 * `/jukebox`.
 *
 * A pure module so the rule can be tested without loading `env.ts`, which
 * reads the real `.env` and requires the Discord token.
 */
export const JUKEBOX_ENV_VARS = ['JUKEBOX_ATRIUM_URL', 'JUKEBOX_ATRIUM_USERNAME', 'JUKEBOX_ATRIUM_PASSWORD'] as const;

export type JukeboxEnvVar = (typeof JUKEBOX_ENV_VARS)[number];

/** The variables still missing when some but not all are set; empty when all or none are. */
export function missingJukeboxVars(vars: Partial<Record<JukeboxEnvVar, string | undefined>>): JukeboxEnvVar[] {
  const missing = JUKEBOX_ENV_VARS.filter((name) => !vars[name]);
  return missing.length === JUKEBOX_ENV_VARS.length ? [] : missing;
}

/** Variables from before brief 29, when the account was Ward's. Nothing reads them now. */
export const STALE_JUKEBOX_VARS = ['JUKEBOX_WARD_URL', 'JUKEBOX_WARD_USERNAME', 'JUKEBOX_WARD_PASSWORD'] as const;

/**
 * The old names still set. The bot would otherwise go quietly off after the
 * deploy if the owner has not renamed them yet, so boot says so.
 */
export function staleJukeboxVars(vars: Record<string, string | undefined>): string[] {
  return STALE_JUKEBOX_VARS.filter((name) => Boolean(vars[name]));
}
