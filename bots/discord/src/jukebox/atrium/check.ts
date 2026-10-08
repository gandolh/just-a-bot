import { jukeboxConfig } from './config.ts';
import { AtriumClient, JukeboxForbidden, SESSION_FILE } from './client.ts';
import { WardSession } from './session.ts';

/**
 * `npm run discord:jukebox-check` (brief 25): prove the Bot account can reach
 * atrium, without starting the bot. It signs in (or resumes the saved
 * session), forces one refresh, then calls `GET /health` and `GET /library`.
 * The last one must be refused with 403 `JUKEBOX_ROLE_FORBIDDEN`: that is
 * atrium's allowlist (its brief 80) and this client working together.
 *
 * It shares `data/jukebox-session.json` with the bot. Run it with the bot
 * stopped: two processes holding one refresh token makes Ward revoke it, and
 * the bot then has to sign in again.
 */

const config = jukeboxConfig();
if (!config) {
  console.log('The Jukebox is not configured: set JUKEBOX_ATRIUM_URL, JUKEBOX_WARD_URL, JUKEBOX_WARD_USERNAME and JUKEBOX_WARD_PASSWORD in bots/discord/.env.');
  process.exit(1);
}

const session = new WardSession({ ...config, storeFile: SESSION_FILE });
const client = new AtriumClient(config, session);
let ok = true;
const step = (label: string, result: string, good: boolean) => {
  ok &&= good;
  console.log(`${good ? '✓' : '✗'} ${label.padEnd(14)} ${result}`);
};

try {
  await session.accessToken();
  step(
    'sign in',
    session.lastSignIn === 'login'
      ? `logged in as ${config.username} (new session)`
      : `resumed the saved session for ${config.username} (refresh, no login)`,
    true,
  );
  await session.forceRefresh();
  step('refresh', 'rotated the refresh token', session.lastSignIn === 'refresh');
} catch (err) {
  step('sign in', `${(err as Error).name}: ${(err as Error).message}`, false);
  process.exit(1);
}

try {
  const health = await client.json<{ status?: string }>('/health');
  step('GET /health', `200 ${JSON.stringify(health)}`, health.status === 'ok');
} catch (err) {
  step('GET /health', `${(err as Error).name}: ${(err as Error).message}`, false);
}

try {
  await client.json('/library');
  step('GET /library', '200, but the Bot account should be refused here', false);
} catch (err) {
  const refused = err instanceof JukeboxForbidden && err.code === 'JUKEBOX_ROLE_FORBIDDEN';
  step('GET /library', refused ? '403 JUKEBOX_ROLE_FORBIDDEN (expected)' : `${(err as Error).name}: ${(err as Error).message}`, refused);
}

process.exit(ok ? 0 : 1);
