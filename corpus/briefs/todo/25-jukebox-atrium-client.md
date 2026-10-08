# Task 25: Jukebox, part 1: signing in to atrium as the Bot account

## Context

Source: the Jukebox grilling with the owner, 2026-10-08. See the decision "Music
comes from atrium, signed in as the bot's own Ward account" in
[decisions.md](../../wiki/decisions.md) and the Music terms in
[glossary.md](../../wiki/glossary.md). This is the first of three briefs
(25, 26, 27). The atrium side is atrium briefs 80, 81 and 82.

The bot plays music only from atrium, the owner's media app on the same VPS,
and reaches it as its own Ward account (the **Bot account**). That account's
`atrium` grant carries the role `jukebox`. Atrium brief 80 makes that role an
allowlist: `/jukebox/*` routes plus the file and cover of `audio` items.
Everything else returns 403 `JUKEBOX_ROLE_FORBIDDEN`.

This brief builds the client only: sign in, stay signed in, and call atrium.
No voice and no commands.

**Ward without a browser.** These facts were checked in wzd_auth's code on
2026-10-07.
- **Login.** `POST {ward}/login` with JSON `{username, password}`.
  - On success: 200 `{subject, username, emailVerified, accessTokenExpiresAt, refreshTokenExpiresAt}`.
  - The tokens arrive **only** as `Set-Cookie`: `ward_session`, the access
    token, with `Max-Age=900`, and `ward_refresh`, valid 30 days.
  - Read them with `response.headers.getSetCookie()`.
- **Refresh.** `POST {ward}/refresh` with JSON `{refreshToken}`.
  - Ward accepts the token in the body for exactly this kind of client.
  - **Send no `Origin` header.** Ward lets requests without one through on
    purpose, and rejects one that doesn't match its own origin with 403
    `cross_site`.
  - On success it returns new cookies. Every failure is 401 `invalid_refresh`.
- **Absolute 30 days.** The 30 days count from login and refreshing doesn't
  extend them, so the bot must log in again at least that often.
- **Reuse kills the session.** Presenting a refresh token that has already been
  rotated (outside a 10-second grace) revokes the whole session family. Save
  each new refresh token before using anything it bought, and never let two
  processes share one.
- **Lockout.** After 5 failed logins per 15 minutes per address, Ward answers
  429 with `Retry-After`. A wrong password in `.env` plus a few restarts locks
  the bot out. A disabled account gets 403 `account_disabled`.
- **Calling atrium.** Send `Cookie: ward_session=<access token>`.
  - 401: the session is dead.
  - 403 `NO_ATRIUM_GRANT` or `JUKEBOX_ROLE_FORBIDDEN`: the grant is wrong. That
    is a configuration problem, so don't retry.
  - 503 `IDENTITY_UNAVAILABLE`: Ward is down. Back off.
  - Revoking the grant takes effect within 30 seconds, because atrium caches
    Ward's answer that long.

Bot conventions that apply:
- An optional integration that is missing reports "not configured" and never
  crashes the bot. See [decisions.md](../../wiki/decisions.md), and
  `commands/ask.ts:42-48` for the reply pattern.
- Env is a zod schema in `bots/discord/src/env.ts:9-16`, loaded through
  `shared/src/env.ts`.
- State is JSON written with `writeJsonFile` (`shared/src/json-file.ts:30-39`),
  which serialises writes per file and renames atomically. Each store declares
  its own path from `import.meta.url`.
- There is no shared HTTP helper. Call sites use `AbortSignal.timeout`, as in
  `trivia/api.ts:87-89`.

## Files you OWN

- `bots/discord/src/env.ts`: four new optional variables
- `bots/discord/.env.example`: the names, with placeholder values only
- `bots/discord/src/jukebox/atrium/` (new): `config.ts`, `session.ts`,
  `client.ts`, `check.ts`, plus `*.test.ts` for the pure parts
- `bots/discord/package.json`: one `jukebox:check` script, plus a root
  `package.json` alias `discord:jukebox-check`, matching `discord:register`
- `docs/discord/setup.md`: the env section (:6-18) and the data-directories
  table (:49-60)

## Files you must NOT touch

- `bots/discord/src/index.ts` and the commands. Brief 26 wires the client in.
- Any file holding a real password. The owner puts credentials in
  `bots/discord/.env`, which is gitignored and never baked into the image.

## What to do

1. **Env.** Add `JUKEBOX_ATRIUM_URL` (for example
   `https://gandolh.ro/atrium-api`), `JUKEBOX_WARD_URL` (for example
   `https://gandolh.ro/ward-api`), `JUKEBOX_WARD_USERNAME` and
   `JUKEBOX_WARD_PASSWORD`. All four are optional but all-or-none, enforced
   with a zod refinement whose error names the missing ones.
   `isJukeboxConfigured()` in `config.ts` is true only when all four are set.
2. **Session** (`session.ts`):
   - Log in and keep the access token in memory only.
   - Persist `{username, refreshToken, refreshTokenExpiresAt}` to
     `bots/discord/data/jukebox-session.json` with `writeJsonFile`. Write it
     **before** using the access token that came with it.
   - On boot, use the saved refresh token if it belongs to the configured
     username. Otherwise, or if it fails, log in.
   - Refresh two minutes before `accessTokenExpiresAt`. Make the refresh
     single-flight: concurrent callers wait on the one in progress.
   - When fewer than 24 hours remain on `refreshTokenExpiresAt`, log in afresh
     instead of refreshing.
3. **Login failures:**
   - 401 bad credentials or 403 `account_disabled`: log one clear error naming
     `JUKEBOX_WARD_USERNAME`, mark the Jukebox as "sign-in failed", and **do
     not retry until restart**. That keeps the lockout bucket clean.
   - 429: wait for `Retry-After`.
   - A network error or 5xx: back off from 2 seconds, doubling up to 60.
4. **Client** (`client.ts`):
   - A small typed `atriumFetch(path, init)` with the cookie and a timeout of 10
     seconds by default. Callers can pass a longer timeout, which brief 26's
     long-poll needs.
   - On 401, refresh once (or log in) and retry once.
   - Map failures to `JukeboxNotConfigured`, `JukeboxSignInFailed`,
     `JukeboxUnavailable` (503, network or timeout) and `JukeboxForbidden`
     (403). Otherwise return the body.
   - Expose a way to stream a response body, because brief 26 pipes
     `GET /library/:id/file` into ffmpeg.
5. **Check script** (`check.ts`, run with `npm run discord:jukebox-check`):
   - log in or reuse the saved token, force one refresh, then call
     `GET /health` and `GET /library`;
   - print each step's result. The last call should print 403
     `JUKEBOX_ROLE_FORBIDDEN`, which proves brief 80's allowlist and this
     client together without needing atrium brief 81.
6. **Tests** with `node:test`, next to the code, for:
   - parsing the two cookies out of `getSetCookie()`;
   - the refresh schedule: refresh, re-login, or wait, given the expiry times;
   - the all-or-none env rule.
7. **Docs.** In `docs/discord/setup.md`, add the four variables to the env
   section and `jukebox-session.json` to the data-directories table.
   `docs/discord/jukebox/README.md` is brief 27's job.

## Acceptance

- `npm run typecheck` and `npm test` are clean, with the new tests.
- **Local run.** The local Ward container has `discord-bot-dev` (owner step in
  atrium brief 80), local atrium has brief 80, and `bots/discord/.env` points at
  both. `npm run discord:jukebox-check` prints a successful login, a successful refresh, health
  200, and `/library` 403 `JUKEBOX_ROLE_FORBIDDEN`.
- **Run it again.** It reuses the saved refresh token, and Ward's audit log
  shows no new login.
- **Wrong password.** Exactly one login attempt, a clear error, and no retry.
  Prove the no-retry rule with a test against a fake Ward, a local HTTP server
  that answers 401. Do the live check at most once: each failed login uses one
  of Ward's five lockout slots, which is what this rule protects.
- With the four variables unset, the bot starts normally, and
  `isJukeboxConfigured()` is false.
- **Production reachability**, an owner step once atrium brief 80 is deployed:
  run the check inside the built container with the production `.env`.
  Health 200 proves the container reaches `gandolh.ro`. Record the result in
  the outcome.
- No credentials appear in any committed file.
