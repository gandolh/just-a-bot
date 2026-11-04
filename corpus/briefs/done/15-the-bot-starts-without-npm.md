# Task 15: The bot starts without npm

## Context

The VPS has 3.7 GiB of RAM shared by every app in the estate, and the owner
doesn't want to upgrade it (vps-deploy's `memory-on-the-box` research,
2026-11-04). The bot's container starts through two `npm` processes
(`CMD ["npm", "run", "discord:start"]`, which runs `npm run start -w
@bots/discord`) before tsx. Each `npm` wrapper held 6-11 MB with 13-24 MB in
swap on 2026-11-04, and `npm` between PID 1 and the bot also forwards
signals poorly, which matters for the shutdown drain.

The owner decided on 2026-11-04 that apps start with `node` directly. The
bot **keeps running TypeScript under tsx**: the "No build step" decision in
[decisions.md](../../wiki/decisions.md) stands; only the `npm` wrappers go.

## Files you OWN

- `infrastructure/Dockerfile` (the `CMD`)
- `infrastructure/docker-compose.yml` if it overrides the command
- `docs/` pages and the README where they name the start command
- `corpus/wiki/architecture.md` or wherever the start is described,
  `status.md`, `log.md`

## Files you must NOT touch

- `bots/discord/.env` (production's values). Don't run the bot against the
  real token, and don't register commands.

## What to do

1. Make the image start the bot with `node` and tsx's loader directly
   (`CMD ["node", "--import", "tsx", "<the entry discord:start runs>"]`, from
   the right working directory), so the bot is PID 1's direct child.
2. Check the shutdown drain still runs on `docker stop` (SIGTERM reaches the
   bot): read the code path, and if Docker can run the image without the
   real token, start it with a dummy `.env` in a scratch copy and stop it.
3. Leave `npm run discord:start` working for local use.

## Acceptance

- `npm` isn't in the container's process tree (`docker top`, if you could
  run it; otherwise say so).
- `npm run typecheck` and `npm test` pass.
- The deploy is the owner's step from vps-deploy.

## Outcome (2026-11-04)

Built in the commit that moved this brief to `done/` ("Brief 15: the bot
starts without npm").

- `infrastructure/Dockerfile`'s `CMD` is `["node", "--import", "tsx",
  "bots/discord/src/index.ts"]`. The old chain was `npm → npm → tsx CLI →
  node`; now it is one `node`, which is the container's PID 1 (the base
  image's `docker-entrypoint.sh` execs it). Still tsx, still no build step.
- **The working directory stays `/app`, not `bots/discord`.** That is where
  `npm run start -w @bots/discord` used to run the bot, but vps-deploy
  registers the commands with `compose run --rm just-a-bot npm run
  discord:register` in the same image, and from `bots/discord` npm finds
  only the workspace's scripts (`register`, not `discord:register`). Every
  runtime path in the bot is built from `import.meta.url`, `env.ts` passes
  its `.env` path explicitly and the Jukebox buffer is under `tmpdir()`, so
  the bot doesn't depend on its working directory. The Dockerfile says why
  the directory must stay.
- `docker-compose.yml` doesn't override the command and is unchanged, as
  are `package.json`'s scripts and `ecosystem.config.cjs`:
  `npm run discord:start` works locally as before.
- The 2026-09-26 Watch item (SIGTERM reached the bot only because busybox
  `sh` execs) no longer applies: no shell or npm stands in between.

Checks, in Docker Desktop, on an image built from a `git archive` export of
the tree (no `.env` in the export or the image; a dummy token file outside
the build context, bind-mounted at run time):
- Image config: entrypoint `docker-entrypoint.sh`, the new `Cmd`,
  `WorkingDir` `/app`.
- The real `CMD` with the dummy token: `docker top`, three times during
  startup, showed one process, `node --import tsx bots/discord/src/index.ts`,
  whose parent is the container shim; no `npm`. It loaded every module,
  read the mounted `.env`, and stopped at `client.login` with
  `TokenInvalid`, as a dummy token must.
- SIGTERM, with a stand-in: the bot exits on the failed login before it
  installs its signal handlers, so its own shutdown could not be stopped
  with `docker stop`. A stand-in script ran the same way (`node --import tsx`,
  from `/app`, PID 1) and used the bot's own `drainStores` and
  `flushAllWorlds` with an RPG world write kept pending. `docker stop` took
  0.22 s, the handler logged, the drain finished with no failures, the world
  file was written, exit code 0. Its tree also showed tsx's esbuild helper
  (`esbuild --service`) under `node`; that helper ran under the tsx CLI's
  `node` before too.
- `npm run` in the image (listing only) shows the root scripts, so the
  deploy's `npm run discord:register` resolves as before. It was not run.
- `npm run typecheck` clean; `npm test` 99/99 in the bot, 5/5 in `shared`.
- The scratch containers and image were removed afterwards.

Not checked: the real bot's shutdown under `docker stop` (it needs a real
login), and memory on the VPS.

One edge case changed: `node` as PID 1 ignores a signal it has no handler
for, and the bot installs its handlers after `client.login` resolves. A
`docker stop` in the first second or so of startup (or while a login
hangs) now waits Docker's 10 s and kills the process, where the old chain
ended at once. Nothing is lost, since the bot holds no unsaved state yet.
`init: true` in the compose file would put an init in front of `node` if
that ever matters.

**Owed by the owner:**
- Deploy from vps-deploy: `node cli.ts just-a-bot deploy`. vps-deploy needs
  no change.
- After the deploy, on the server: `docker top` on the bot's container
  shows one `node` process and no `npm`; a redeploy's logs show "Received
  SIGTERM, shutting down…" from the old container.
