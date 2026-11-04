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
