# Task 07 — Container: keep bot state outside the container, and settle pm2 vs Docker

> **Progress 2026-10-04.** Done: steps 1 (answered by brief 20's addendum and the owner: the container is production), 2, 3, 5, 6, 7. Checked: `docker compose config` shows both mounts; a fresh image has no `/app/bots/data`. **Left, on the box, by the owner:** step 4, which is brief 20's step 4, and the `/coins` recreate check after the deploy.
>
> **2026-10-07: the owner chose to purge all state and start fresh**, so nothing is reconciled. A read-only check that day found less than feared: no pm2 process, no pm2-era `/srv/just-a-bot/bots/discord/data` on the host, and no `/app/bots/discord/data` inside the running container (`infrastructure-just-a-bot-1`, up 4 weeks). The only state anywhere is `bots/data/{reminders,birthdays}.json` (12 KB), on the host and in the container. A dry run of `node cli.ts just-a-bot server` shows the expected plan: empty `state/shared` and `state/discord`, `--exclude=bots/data --exclude=/state`, rebuild, `up -d`. **Left for the owner** (the agent's deploy was blocked as a production action): run that deploy from `../vps-deploy`, then `ssh hetzner-svc 'rm -rf /srv/just-a-bot/bots/data'`, then `/coins add 1`, deploy again, and check the balance survived.

## Context

Source: the 2026-09-26 improvements audit, recorded in [log.md](../../log.md).
Rank 4 of 16. **Needs a user answer first** (step 1).

Commit `53a5cbb` (2026-09-06) added `infrastructure/Dockerfile`,
`infrastructure/docker-compose.yml` and `.dockerignore` for the estate's deploy.
Nothing in `corpus/` records it, and [decisions.md](../../wiki/decisions.md)
"pm2 for process management" still says "Rejected: systemd units, containers".

The bot keeps all its state as JSON in two directories, both resolved relative
to source files:

- `/app/bots/data` holds `reminders.json` (`reminders/store.ts:6`) and
  `birthdays.json` (`reminders/birthdays.ts:6`).
- `/app/bots/discord/data` holds wallets, timezones, `confessions/`, `quotes/`,
  `rpg/`, `mafia/` and `dnd/`.

`docker-compose.yml` bind-mounts only the `.env` (`:15`). Neither data directory
has a volume. If the container is the live path, all state sits in the
container's writable layer. The first `docker compose up --build` or
`--force-recreate` after a code change starts a fresh container, and every
wallet, reminder, quote, confession, RPG world and birthday is gone.

Separately, `.dockerignore:10` excludes `bots/*/data`. That pattern matches
`bots/discord/data` but not `bots/data`. As a result `COPY bots ./bots`
(`Dockerfile:28`) bakes the builder's local `bots/data/birthdays.json` and
`reminders.json`, which hold user IDs and birthdays, into the image layer. That
seeds production with dev data and ships personal data in every copy of the
image.

## Addendum from the second 2026-09-26 pass: read brief 20 first

The estate repo answers step 1 and makes steps 3 and 4 unsafe as written. The
evidence is in brief [20](20-estate-state-protection.md).

- **Step 1.** `../vps-deploy/stacks/just-a-bot.ts` has deployed this bot only as
  a container since `8bec566` (2026-09-06). Brief 20's step 1 checks whether the
  switch has actually run on the box.
- **Step 3.** Keep the compose defaults for local use, but they're wrong on the
  VPS. The estate's rsync rewrites `/srv/just-a-bot/bots/data` on every deploy,
  and `/srv/just-a-bot/bots/discord/data` probably still holds the pm2-era state.
  Brief 20 makes the estate set `JUST_A_BOT_DATA` and `JUST_A_BOT_DISCORD_DATA`
  to a directory outside the mirror.
- **Step 4.** Don't copy the container's state onto the host data paths. That
  overwrites the pm2-era copy. Use brief 20's step 4, which stages both copies
  and lets the user choose file by file.
- Deploy this brief and brief 20 together.

## Files you OWN

- `infrastructure/docker-compose.yml`
- `.dockerignore`
- `corpus/wiki/decisions.md`, the "pm2 for process management" entry only
- `corpus/wiki/status.md`, one line naming the live deploy path
- `corpus/log.md` (append)

## Files you must NOT touch

- `infrastructure/Dockerfile`'s runtime. Running tsx from dev dependencies is
  deliberate and explained in its header.
- `ecosystem.config.cjs`. Brief 18 adds `kill_timeout`.
- Other `decisions.md` entries. Brief 12 rewords "No build step".

## What to do

1. **Ask the user** which path runs production on the VPS today: pm2 via
   `ecosystem.config.cjs`, the container via the estate's deploy, or both during a
   migration. Don't guess. The `decisions.md` wording depends on the answer.
2. `.dockerignore`: add `bots/data` next to `bots/*/data`.
3. `docker-compose.yml`: add two read-write bind mounts. Make them
   env-overridable in the same style as `JUST_A_BOT_ENV`, with a comment that they
   hold all bot state and must survive a recreate:
   ```yaml
   - ${JUST_A_BOT_DATA:-../bots/data}:/app/bots/data
   - ${JUST_A_BOT_DISCORD_DATA:-../bots/discord/data}:/app/bots/discord/data
   ```
4. If the container is already live, its state is inside that container right
   now. Before anything recreates it, copy the state out to the host paths the new
   mounts will use:
   `docker compose cp just-a-bot:/app/bots/data <host dir>`, and the same for
   `/app/bots/discord/data`. This runs on the VPS, and if it's skipped the state is
   lost for good. The user runs it, or explicitly authorizes you to. Put the exact
   commands in the log entry either way.
5. `decisions.md`: record an explicit revisit on the pm2 entry, as the page's own
   rule requires (a revisit plus a `log.md` note). Say which path is live, why the
   image exists (the estate's deploy, `53a5cbb`), and what did not change (tsx
   runtime, no build, `.env` bind-mounted rather than baked in). If pm2 is no
   longer the production path, say what replaces `pm2 logs` (probably
   `docker compose logs`), since `pm2 logs` is the reason the entry gives for
   keeping pm2.
6. `status.md`: one line naming the live deploy path.
7. `log.md`: a `decision` entry.

## Acceptance

- If Docker is available, `docker compose -f infrastructure/docker-compose.yml config`
  shows both data mounts.
- A freshly built image has no `/app/bots/data`:
  `docker run --rm --entrypoint ls just-a-bot:1.0 /app/bots` doesn't list `data`.
- Wherever the container runs: `/coins add 123`, then
  `docker compose up -d --force-recreate`. `/coins balance` still shows the coins.
- `decisions.md` no longer contradicts the repo, and `bash corpus/lint.sh` is clean.

## Outcome (2026-10-07)

Deployed by the owner on 2026-10-07 with both briefs in, after the owner chose
to purge the bot's state instead of reconciling copies. The owner also deleted
`/srv/just-a-bot/bots/data` on the host. Checked the same day, read-only: the
container `infrastructure-just-a-bot-1` runs the new image and logs in; its
mounts are `/srv/just-a-bot/state/shared -> /app/bots/data` and
`/srv/just-a-bot/state/discord -> /app/bots/discord/data`, both empty (a fresh
start); `/srv/just-a-bot/bots/data` is gone. Not run by the agent: the Discord
check (`/coins add 1`, deploy again, the balance survives). The owner can run it
in Discord at any time.
