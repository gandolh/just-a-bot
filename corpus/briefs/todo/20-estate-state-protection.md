# Task 20 — Estate deploy: keep the bot's state out of the rsync mirror, and choose which copy survives

> **Progress 2026-10-04.** Done in `../vps-deploy` (`4acca94`): steps 2 and 3. The dry run prints `--exclude=bots/data` and `--exclude=/state`. The rsync simulation with the exact flags keeps a server-only `bots/data` file, the server's `reminders.json`, `state/`, and the pm2-era `bots/discord/data`. **Left, by the owner on the VPS** (decided 2026-10-04): step 1 (read-only), step 4 (back up, stage both copies, pick per file), then step 5's deploy and the acceptance checks.
>
> **2026-10-07:** step 1 is answered. The owner confirmed the pm2-to-container cutover ran for all four services, so the bot is live as a container. Steps 4 and 5 are still the owner's.
>
> **2026-10-07: the owner chose to purge all state and start fresh**, so nothing is reconciled. A read-only check that day found less than feared: no pm2 process, no pm2-era `/srv/just-a-bot/bots/discord/data` on the host, and no `/app/bots/discord/data` inside the running container (`infrastructure-just-a-bot-1`, up 4 weeks). The only state anywhere is `bots/data/{reminders,birthdays}.json` (12 KB), on the host and in the container. A dry run of `node cli.ts just-a-bot server` shows the expected plan: empty `state/shared` and `state/discord`, `--exclude=bots/data --exclude=/state`, rebuild, `up -d`. **Left for the owner** (the agent's deploy was blocked as a production action): run that deploy from `../vps-deploy`, then `ssh hetzner-svc 'rm -rf /srv/just-a-bot/bots/data'`, then `/coins add 1`, deploy again, and check the balance survived.

## Context

Source: the second 2026-09-26 improvements pass, recorded in [log.md](../../log.md).
Rank 1 of the second pass. **Brief [07](07-container-state-volumes.md) must not
deploy until this one lands.** Run the two together.

This brief edits the sibling repo `../vps-deploy`, the estate's deploy tool. It
is filed here because the data at risk belongs to this bot.

Brief 07 found that the container has no data volume. The estate repo explains
why nobody noticed, and it holds two traps that 07 doesn't cover.

**1. The estate treats this bot as stateless.** The pm2-to-container cutover
script lists just-a-bot with `backup: []` and the note "stateless — its config
is the .env the deploy pushes" (`../vps-deploy/scripts/switch-to-containers.ts:98-104`).
`../vps-deploy/docs/cutover-to-containers.md:90` says the same. The stack passes
no `state` to `ContainerService` (`../vps-deploy/stacks/just-a-bot.ts:88-116`).
Stacks with state do, for example `stacks/newspapper.ts:58` and `:80-85`. The
header of `lib/constructs/container-service.ts:18-21` says state must be
bind-mounted from outside the mirrored tree.

This also answers 07's step 1 from the repo side. Since `8bec566` (2026-09-06)
the estate deploys this stack only as a container, and no pm2 path remains.
Whether the switch has actually run on the box is a one-command check, step 1
below.

**2. Every deploy overwrites `bots/data` on the server.** The source sync runs
`rsync -avzR --delete` over `bots` (`lib/constructs/container-service.ts:208-222`)
with the excludes at `stacks/just-a-bot.ts:102`. The pattern `bots/*/data`
matches `bots/discord/data` but not `bots/data`. On 2026-09-26 a simulation with
the exact flags and excludes did this to a fake server tree:

- deleted a server-only file in `bots/data/`
- replaced the server's `bots/data/reminders.json` with the local copy
- left `bots/discord/data/` alone

So each deploy pushes the laptop's `bots/data/{birthdays,reminders}.json` over
the server's. Brief 07 mounts `${JUST_A_BOT_DATA:-../bots/data}`. Compose
resolves that default against `infrastructure/`, giving `/srv/just-a-bot/bots/data`,
which is the directory this rsync rewrites. If the estate doesn't point
`JUST_A_BOT_DATA` somewhere else, the first deploy after 07 replaces live
reminders and birthdays with dev data.

**3. There may be two diverged copies of the state, and 07's step 4 overwrites
the older one.** If the switch ran, the pm2-era files are probably still at
`/srv/just-a-bot/bots/discord/data/` on the host. That directory is excluded from
the rsync, so `--delete` never touched it, and `switch-to-containers.ts prune`
removes only pm2 (`:366-428`). The container started with an empty
`bots/discord/data`, because `.dockerignore` keeps it out of the image, and it
has written its own copy since cutover.

Brief 07's default mount `${JUST_A_BOT_DISCORD_DATA:-../bots/discord/data}` is
that same pm2-era host directory. Its step 4 copies the container's state "to
the host paths the new mounts will use". Done literally, that replaces months
of pm2-era wallets, RPG worlds, quotes and confessions with the few weeks the
container has seen. Deploying 07 without step 4 does the reverse: the bot
reverts to the pm2-era state and silently drops everything since cutover.

The pm2-era `bots/data` (reminders and birthdays) was probably overwritten on the
first container deploy by trap 2. The cutover took no backup, so that copy is
likely gone.

Checked on 2026-09-26 with a Docker build against the repo's real
`.dockerignore`: an image built from this repo contains
`/app/bots/data/birthdays.json` (222 bytes of dev data) and `reminders.json`,
and has no `/app/bots/discord/data`. On the server the build context is the
rsync mirror, so the image carries whatever trap 2 pushed.

## Files you OWN

- `../vps-deploy/stacks/just-a-bot.ts`
- `../vps-deploy/scripts/switch-to-containers.ts`, the just-a-bot target entry only
- `../vps-deploy/docs/cutover-to-containers.md`, the "stateless" claim about
  just-a-bot only
- `corpus/log.md` (append)

## Files you must NOT touch

- `infrastructure/docker-compose.yml` and `.dockerignore`. Brief 07 owns them.
  Its env-overridable mounts are what this brief points at.
- Any other stack or construct in `../vps-deploy`.
- The uncommitted work already sitting in `../vps-deploy` on 2026-09-26
  (`README.md`, `app.ts`, `lib/estate.ts` and others). It isn't yours. Don't
  commit, stash or revert it, and when the user asks for a commit, stage only
  your own files.
- Anything on the VPS without the user's explicit go-ahead. Steps 1, 4 and 5 run
  there.

## What to do

1. **Find out what is live.** This command only reads. Ask the user to run it,
   or to authorize you to:

   ```
   ssh hetzner-svc 'export DOCKER_HOST=unix:///run/user/$(id -u)/docker.sock; docker ps -a --filter name=just-a-bot --format "{{.Names}} {{.Status}}"; ls -la --time-style=long-iso /srv/just-a-bot/bots/data /srv/just-a-bot/bots/discord/data 2>&1'
   ssh hetzner 'pm2 ls 2>/dev/null | grep -i discord'
   ```

   `hetzner-svc` is the services account and `hetzner` the admin account
   (`../vps-deploy/lib/estate.ts:99-110`). The `DOCKER_HOST` prefix is the one
   the deploy itself uses (`container-service.ts`, `dockerEnv()`). Put the output
   in the log entry.

2. **Declare the state in `stacks/just-a-bot.ts`,** copying `stacks/newspapper.ts`:
   - add ``const STATE_DIR = `${SERVER_DIR}/state`;``
   - create a `PersistentState` with `host: estate.servicesHost`,
     ``dirs: [`${STATE_DIR}/shared`, `${STATE_DIR}/discord`]``,
     `excludes: ["/state"]`, and a `contains:` line naming wallets, reminders,
     birthdays, quotes, confessions, RPG worlds, mafia games and timezones. Pass
     it as `state` to the `ContainerService`.
   - add ``JUST_A_BOT_DATA: `${STATE_DIR}/shared` `` and
     ``JUST_A_BOT_DISCORD_DATA: `${STATE_DIR}/discord` `` to `environment`, next
     to `JUST_A_BOT_ENV`
   - add `"bots/data"` to `excludes`, so a developer's local state never leaves
     the laptop
   - fix the class comment, which says the bot has no state to speak of

3. **Fix the stateless claim.** In `switch-to-containers.ts`, give the just-a-bot
   target `backup: ["/srv/just-a-bot/bots/discord/data", "/srv/just-a-bot/bots/data"]`
   and a note saying it keeps JSON state. Fix the same claim in
   `docs/cutover-to-containers.md:90`.

4. **Reconcile the copies before any deploy that mounts state.** This runs on the
   VPS as the services account, and the user decides which copy wins.
   - Back up first. Tar `/srv/just-a-bot/bots/data` and
     `/srv/just-a-bot/bots/discord/data` into a dated file under `/var/backups/`,
     the location the cutover script uses.
   - If the container exists, copy its state into staging directories that don't
     exist yet. Never copy onto the host data paths. From `/srv/just-a-bot`:
     `docker compose -f infrastructure/docker-compose.yml cp just-a-bot:/app/bots/discord/data /srv/just-a-bot/state-container-discord`,
     then the same for `/app/bots/data` into `/srv/just-a-bot/state-container-shared`.
   - Show the user both copies side by side: file list, sizes and mtimes, plus
     for `wallets.json` the user count and total coins. The pm2-era copy covers
     everything before cutover, and the container copy everything since.
   - The user picks a copy for each file. Put the chosen files into
     `/srv/just-a-bot/state/shared` and `/srv/just-a-bot/state/discord`, owned by
     the services account. Rootless Docker maps container root to that account,
     so the bot can write there.

5. **Deploy with both briefs in.** From `../vps-deploy`, run
   `node cli.ts just-a-bot server` only once this brief and brief 07 have both
   landed.

6. **Log it.** Append a `maintenance` entry to `corpus/log.md` with the step 1
   output, which copy won for each file, and the backup file names.

## Acceptance

- `node cli.ts just-a-bot server --dry-run` from `../vps-deploy` prints the rsync
  command with `--exclude=bots/data` and `--exclude=/state`.
- Rerun the rsync simulation with the new excludes. Build a scratch `local/` and
  `server/` tree, and use the flags from `container-service.ts:208-222`. A
  server-only file under `server/bots/data/` and one under `server/state/` both
  survive unchanged.
- On the box after the deploy, `docker compose -f infrastructure/docker-compose.yml config`
  shows both mounts resolved to `/srv/just-a-bot/state/...`.
- `/coins balance` shows the balance the chosen copy says you have. Run
  `/coins add 1`, deploy again, and the balance still includes it.
- `/remindme list` shows production reminders, not the dev ones.
