import { env } from '../../env.ts';

/** Where atrium and Ward are, and the Bot account to sign in as. */
export interface JukeboxConfig {
  /** Atrium's API root, e.g. `https://gandolh.ro/atrium-api`. */
  atriumUrl: string;
  /** Ward's API root, e.g. `https://gandolh.ro/ward-api`. */
  wardUrl: string;
  username: string;
  password: string;
}

const trimSlash = (url: string) => url.replace(/\/+$/, '');

/** The Jukebox's settings, or null when its variables are unset (`env.ts` refuses a partial set). */
export function jukeboxConfig(): JukeboxConfig | null {
  const { JUKEBOX_ATRIUM_URL, JUKEBOX_WARD_URL, JUKEBOX_WARD_USERNAME, JUKEBOX_WARD_PASSWORD } = env;
  if (!JUKEBOX_ATRIUM_URL || !JUKEBOX_WARD_URL || !JUKEBOX_WARD_USERNAME || !JUKEBOX_WARD_PASSWORD) return null;
  return {
    atriumUrl: trimSlash(JUKEBOX_ATRIUM_URL),
    wardUrl: trimSlash(JUKEBOX_WARD_URL),
    username: JUKEBOX_WARD_USERNAME,
    password: JUKEBOX_WARD_PASSWORD,
  };
}

/** True only when all four Jukebox variables are set. A missing Jukebox is "not configured", never a crash. */
export function isJukeboxConfigured(): boolean {
  return jukeboxConfig() !== null;
}
