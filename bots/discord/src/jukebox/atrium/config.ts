import { env } from '../../env.ts';

/** Where atrium is, and the Bot account to sign in as. */
export interface JukeboxConfig {
  /** Atrium's API root, e.g. `https://example.com/atrium-api`. */
  atriumUrl: string;
  username: string;
  password: string;
}

const trimSlash = (url: string) => url.replace(/\/+$/, '');

/** The Jukebox's settings, or null when its variables are unset (`env.ts` refuses a partial set). */
export function jukeboxConfig(): JukeboxConfig | null {
  const { JUKEBOX_ATRIUM_URL, JUKEBOX_ATRIUM_USERNAME, JUKEBOX_ATRIUM_PASSWORD } = env;
  if (!JUKEBOX_ATRIUM_URL || !JUKEBOX_ATRIUM_USERNAME || !JUKEBOX_ATRIUM_PASSWORD) return null;
  return {
    atriumUrl: trimSlash(JUKEBOX_ATRIUM_URL),
    username: JUKEBOX_ATRIUM_USERNAME,
    password: JUKEBOX_ATRIUM_PASSWORD,
  };
}

/** True only when all three Jukebox variables are set. A missing Jukebox is "not configured", never a crash. */
export function isJukeboxConfigured(): boolean {
  return jukeboxConfig() !== null;
}
