# deploy

Zero-dependency TypeScript deploy tool for the bots. Uses only Node built-ins
and runs via `tsx` (already a devDependency at the repo root). Replaces the old
`deploy.sh` / `stop.sh`.

## Setup

```sh
cp deploy/.env.example deploy/.env   # then fill in SSH_HOST + REMOTE_DIR
```

`deploy/.env` holds only the deploy *connection* config (SSH target, remote
dir, node version, which bot .env files to push). Bot **runtime** secrets stay
in `bots/*/.env` and are pushed to the server during `deploy`.

## Two phases

| Phase        | Command                  | What it does |
| ------------ | ------------------------ | ------------ |
| `pre-deploy` | `npm run deploy:pre`     | Prepare the server: install Node (NodeSource), a C/C++ toolchain for native deps, and pm2; enable pm2-on-boot. Idempotent — probes first, only acts when something is missing. |
| `deploy`     | `npm run deploy`         | Build & ship: rsync the tree, push bot `.env` files, `npm ci` (skipped when the lockfile is unchanged), restart under pm2, register Discord slash commands. |

## All commands

Run directly with `npx tsx deploy/index.ts <command>`, or via the npm aliases:

```sh
npm run deploy:pre        # pre-deploy (server prep)
npm run deploy            # full deploy (default)
npm run deploy:status     # pm2 status
npm run deploy:logs       # tail pm2 logs (interactive)
npm run deploy:stop       # stop bots (survives reboot)

npx tsx deploy/index.ts restart    # pm2 restart, no sync/install
npx tsx deploy/index.ts start      # start bots again
npx tsx deploy/index.ts delete     # remove from pm2 (next deploy re-adds)
npx tsx deploy/index.ts register   # re-register Discord slash commands
npx tsx deploy/index.ts help
```

## Notes

- `deploy/.env` is gitignored (the global `.env` rule). `.env.example` is tracked.
- `pre-deploy` uses `sudo` on the server for apt / global npm / the pm2 boot
  unit — the SSH user needs sudo. The phase is safe to re-run anytime.
- The mafia-activity client build is disabled (see the commented block in
  `index.ts` and `ecosystem.config.cjs`); re-enable both together.
