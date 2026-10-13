import { jukeboxConfig } from './config.ts';
import { AtriumClient, JukeboxForbidden } from './client.ts';
import { AtriumSession } from './session.ts';

/**
 * `npm run discord:jukebox-check` (briefs 25 and 29): prove the Bot account can
 * reach atrium, without starting the bot. It logs in, calls `GET /health`, then
 * forgets the session and calls `GET /health` again to see the client log in
 * afresh, and finally calls `GET /library`. That last one must be refused with
 * 403 `JUKEBOX_ROLE_FORBIDDEN`: atrium's allowlist (its D55) and this client
 * working together. It logs out when done.
 *
 * The session is in memory, so this shares nothing with a running bot and it
 * is safe to run beside it. It makes one login, or two at most, and a login
 * that succeeds spends none of atrium's lockout slots.
 */

const config = jukeboxConfig();
if (!config) {
  console.log('The Jukebox is not configured: set JUKEBOX_ATRIUM_URL, JUKEBOX_ATRIUM_USERNAME and JUKEBOX_ATRIUM_PASSWORD in bots/discord/.env.');
  process.exit(1);
}

const session = new AtriumSession(config);
const client = new AtriumClient(config, session);
let ok = true;
const step = (label: string, result: string, good: boolean) => {
  ok &&= good;
  console.log(`${good ? '✓' : '✗'} ${label.padEnd(14)} ${result}`);
};

try {
  await session.cookie();
  step('sign in', `logged in as ${config.username}`, session.logins === 1);
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
  session.invalidate();
  await client.json('/health');
  step('log in again', 'dropped the session; the next call logged in afresh', session.logins === 2);
} catch (err) {
  step('log in again', `${(err as Error).name}: ${(err as Error).message}`, false);
}

try {
  await client.json('/library');
  step('GET /library', '200, but the Bot account should be refused here', false);
} catch (err) {
  const refused = err instanceof JukeboxForbidden && err.code === 'JUKEBOX_ROLE_FORBIDDEN';
  step('GET /library', refused ? '403 JUKEBOX_ROLE_FORBIDDEN (expected)' : `${(err as Error).name}: ${(err as Error).message}`, refused);
}

await session.logout();
process.exit(ok ? 0 : 1);
