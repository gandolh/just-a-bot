/**
 * The Jukebox's four variables are optional, but all or none (brief 25): three
 * of four is a half-finished setup, and failing fast on boot names what is
 * missing instead of leaving the bot to discover it at the first `/jukebox`.
 *
 * A pure module so the rule can be tested without loading `env.ts`, which
 * reads the real `.env` and requires the Discord token.
 */
export const JUKEBOX_ENV_VARS = [
  'JUKEBOX_ATRIUM_URL',
  'JUKEBOX_WARD_URL',
  'JUKEBOX_WARD_USERNAME',
  'JUKEBOX_WARD_PASSWORD',
] as const;

export type JukeboxEnvVar = (typeof JUKEBOX_ENV_VARS)[number];

/** The variables still missing when some but not all are set; empty when all or none are. */
export function missingJukeboxVars(vars: Partial<Record<JukeboxEnvVar, string | undefined>>): JukeboxEnvVar[] {
  const missing = JUKEBOX_ENV_VARS.filter((name) => !vars[name]);
  return missing.length === JUKEBOX_ENV_VARS.length ? [] : missing;
}
