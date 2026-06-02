#!/usr/bin/env -S npx tsx
//
// Deploy the bots to the VPS. Zero runtime dependencies — Node built-ins only,
// run via tsx (a devDependency). Connection details come from deploy/.env
// (copy deploy/.env.example). Bot runtime secrets stay in bots/*/.env and are
// pushed on deploy.
//
// Two phases:
//   pre-deploy  Prepare the server: install Node (NodeSource), a build
//               toolchain for native deps, and pm2; enable pm2-on-boot.
//               Idempotent — safe to re-run; skips anything already present.
//   deploy      Build & ship: rsync the tree, push bot .env files, npm ci
//               (skipped when the lockfile is unchanged), restart under pm2,
//               and register Discord slash commands.
//
// Usage:
//   npx tsx deploy/index.ts pre-deploy     # one-time / occasional server prep
//   npx tsx deploy/index.ts deploy         # full deploy (default)
//   npx tsx deploy/index.ts restart        # just pm2 restart (no sync/install)
//   npx tsx deploy/index.ts stop           # stop bots (survives reboot)
//   npx tsx deploy/index.ts start          # start them again
//   npx tsx deploy/index.ts delete         # remove from pm2 (next deploy re-adds)
//   npx tsx deploy/index.ts status         # pm2 status
//   npx tsx deploy/index.ts logs           # tail pm2 logs (interactive)
//   npx tsx deploy/index.ts help
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  REPO_ROOT,
  loadConfig,
  log,
  die,
  pause,
  run,
  capture,
  ssh,
  sshCapture,
  sshTarget,
  rsyncDest,
  rsyncSshTransport,
  type Config,
} from "./lib.ts";

const ECOSYSTEM = "ecosystem.config.cjs";

// --------------------------------------------------------------------------
// pre-deploy: bring the server to a known-good baseline. Each step probes
// first and only acts when something is missing, so re-running is cheap.
// --------------------------------------------------------------------------
function preDeploy(cfg: Config): void {
  log.step(`Pre-deploy: preparing ${describe(cfg)}`);

  // 1. Node (NodeSource). Install only if absent or below the wanted major.
  log.step("Checking Node...");
  const nodeVer = sshCapture(cfg, "node --version 2>/dev/null || true");
  const haveMajor = nodeVer.startsWith("v")
    ? parseInt(nodeVer.slice(1).split(".")[0], 10)
    : 0;
  const wantMajor = parseInt(cfg.nodeMajor, 10);
  if (haveMajor >= wantMajor) {
    log.ok(`node ${nodeVer} present (>= v${wantMajor})`);
  } else {
    log.info(`installing Node ${wantMajor}.x via NodeSource...`);
    ssh(
      cfg,
      `curl -fsSL https://deb.nodesource.com/setup_${wantMajor}.x | sudo -E bash - && sudo apt-get install -y nodejs`,
    );
    log.ok(`node ${sshCapture(cfg, "node --version")} installed`);
  }

  // 2. Build toolchain for native deps (@discordjs/opus, sodium-native compile
  //    from source when no prebuilt binary matches the node ABI).
  log.step("Checking build toolchain (build-essential, python3)...");
  const haveGcc = sshCapture(cfg, "command -v gcc >/dev/null && echo yes || true");
  const havePy = sshCapture(cfg, "command -v python3 >/dev/null && echo yes || true");
  if (haveGcc === "yes" && havePy === "yes") {
    log.ok("toolchain present");
  } else {
    log.info("installing build-essential python3...");
    ssh(cfg, "sudo apt-get install -y build-essential python3");
    log.ok("toolchain installed");
  }

  // 3. pm2, installed globally.
  log.step("Checking pm2...");
  const havePm2 = sshCapture(cfg, "command -v pm2 >/dev/null && echo yes || true");
  if (havePm2 === "yes") {
    log.ok(`pm2 ${sshCapture(cfg, "pm2 --version")} present`);
  } else {
    log.info("installing pm2 globally...");
    ssh(cfg, "sudo npm install -g pm2");
    log.ok("pm2 installed");
  }

  // 4. pm2 boot unit, so the saved process list survives reboots. `pm2 startup`
  //    prints a sudo command; with sudo available we can run it directly by
  //    asking pm2 to set it up for the current user.
  log.step("Ensuring pm2 starts on boot...");
  const startupOut = sshCapture(cfg, "pm2 startup systemd -u $USER --hp $HOME 2>/dev/null || true");
  const sudoLine = startupOut
    .split("\n")
    .find((l) => l.trim().startsWith("sudo env"))
    ?.trim();
  if (sudoLine) {
    // This line needs sudo with a password, but our SSH runs non-interactively
    // (no TTY for the prompt). Hand the user the exact command to run on the
    // server themselves, with a TTY, then wait for them to confirm.
    const { dest, opts } = sshTarget(cfg);
    // Single-quote the remote command so $PATH expands on the SERVER, not in
    // the user's local shell when they paste this.
    const quoted = `'${sudoLine.replace(/'/g, `'\\''`)}'`;
    const sshCmd = ["ssh", "-t", ...opts, dest, quoted].join(" ");
    log.warn("the pm2 boot unit needs sudo (a password) — run this yourself:");
    console.log(`\n   ${sshCmd}\n`);
    pause("Run the command above on the server, then press Enter to continue...");
    log.ok("continuing");
  } else {
    log.ok("pm2 boot unit already configured");
  }

  log.step("Pre-deploy done. Next: npx tsx deploy/index.ts deploy");
}

// --------------------------------------------------------------------------
// deploy: build & ship. Assumes the server baseline from pre-deploy exists.
// --------------------------------------------------------------------------
function deploy(cfg: Config): void {
  log.step(`Deploying to ${describe(cfg)}`);

  // 0. Probe the server lockfile hash + node_modules presence BEFORE rsync
  //    overwrites the lockfile, so we can skip npm ci when deps are unchanged.
  const remoteLockBefore = sshCapture(
    cfg,
    `sha256sum ${cfg.remoteDir}/package-lock.json 2>/dev/null | cut -d" " -f1; [ -d ${cfg.remoteDir}/node_modules ] && echo HAS_NM`,
  );
  const localLockHash = capture("sha256sum", [
    resolve(REPO_ROOT, "package-lock.json"),
  ]).split(/\s+/)[0];

  // 1. Sync code. Trailing slash on src copies contents. Excludes mirror the
  //    old deploy.sh: never ship node_modules, .git, runtime data/, .env, logs,
  //    or build output (the server builds/runs its own).
  log.step("Syncing files...");
  const excludes = [
    ".git/",
    "node_modules/",
    "bots/*/node_modules/",
    "bots/*/data/",
    ".env",
    "bots/*/.env",
    "deploy/.env",
    "*.log",
    "logs/",
    "dist/",
    "bots/*/dist/",
  ];
  run("rsync", [
    "-az",
    "--delete",
    ...excludes.flatMap((e) => ["--exclude", e]),
    "-e",
    rsyncSshTransport(cfg),
    `${REPO_ROOT}/`,
    rsyncDest(cfg, `${cfg.remoteDir}/`),
  ]);

  // 2. Push bot .env files. Separate rsync WITHOUT --delete so the secret
  //    upload can never interact with delete logic. Local is the source of
  //    truth; a missing local .env is skipped, never wiping the server's.
  log.step("Syncing bot .env files...");
  for (const ef of cfg.envFiles) {
    const local = resolve(REPO_ROOT, ef);
    if (existsSync(local)) {
      run("rsync", [
        "-az",
        "-e",
        rsyncSshTransport(cfg),
        local,
        rsyncDest(cfg, `${cfg.remoteDir}/${ef}`),
      ]);
      log.ok(`pushed ${ef}`);
    } else {
      log.warn(`${ef} not found locally — leaving the server's copy untouched`);
    }
  }

  // 3. Install deps (one root npm ci covers every workspace). Skip when the
  //    lockfile is unchanged AND node_modules already exists — npm ci wipes &
  //    rebuilds node_modules (recompiling native deps), so the skip saves time.
  log.step("Checking dependencies...");
  if (remoteLockBefore === `${localLockHash}\nHAS_NM`) {
    log.ok("lockfile unchanged and node_modules present — skipping npm ci");
  } else {
    log.info("lockfile changed or node_modules missing — running npm ci...");
    ssh(cfg, `cd ${cfg.remoteDir} && npm ci`);
  }

  // 4. mafia-activity client build is disabled for now (mirrors ecosystem
  //    config). Re-enable when that bot ships:
  //    ssh(cfg, `cd ${cfg.remoteDir} && npm run mafia-activity:build`);

  // 5. (Re)start under pm2.
  log.step("Starting bots under pm2...");
  ssh(cfg, `cd ${cfg.remoteDir} && pm2 startOrReload ${ECOSYSTEM} --update-env && pm2 save`);

  // 6. Register Discord slash commands. Guild-scoped put is idempotent; a
  //    hiccup here must not fail a deploy whose bots already restarted.
  log.step("Registering Discord slash commands...");
  const code = ssh(cfg, `cd ${cfg.remoteDir} && npm run discord:register`, {
    allowFail: true,
  });
  if (code === 0) {
    log.ok("commands registered");
  } else {
    log.warn(
      `slash-command registration failed — bots are running. Re-run later with: npx tsx deploy/index.ts register`,
    );
  }

  log.step("Done. Check status with: npx tsx deploy/index.ts status");
}

// ---- smaller subcommands (ported from deploy.sh / stop.sh) -----------------
function restart(cfg: Config): void {
  log.step(`Restarting pm2 processes on ${describe(cfg)}`);
  ssh(cfg, `cd ${cfg.remoteDir} && pm2 restart ${ECOSYSTEM} --update-env && pm2 save`);
}

function start(cfg: Config): void {
  log.step(`Starting bots on ${describe(cfg)}`);
  ssh(cfg, `cd ${cfg.remoteDir} && pm2 startOrReload ${ECOSYSTEM} --update-env && pm2 save`);
  log.ok("started");
}

function stop(cfg: Config): void {
  log.step(`Stopping bots on ${describe(cfg)}`);
  // Stop everything pm2 manages, then save so the stopped state survives reboot.
  ssh(cfg, "pm2 stop all && pm2 save");
  log.ok("stopped. Bring them back with: npx tsx deploy/index.ts start");
}

function del(cfg: Config): void {
  log.step(`Deleting bots from pm2 on ${describe(cfg)}`);
  ssh(cfg, `pm2 delete ${ECOSYSTEM} 2>/dev/null || pm2 delete all; pm2 save`);
  log.ok("deleted. A deploy will bring them back.");
}

function status(cfg: Config): void {
  ssh(cfg, "pm2 status");
}

function logs(cfg: Config): void {
  ssh(cfg, "pm2 logs", { tty: true });
}

function register(cfg: Config): void {
  log.step("Registering Discord slash commands...");
  ssh(cfg, `cd ${cfg.remoteDir} && npm run discord:register`);
  log.ok("commands registered");
}

function describe(cfg: Config): string {
  const target = cfg.sshHost || cfg.sshHostname;
  return `${target}:${cfg.remoteDir}`;
}

function help(): void {
  console.log(`Deploy tool — zero-dependency, run via tsx.

Setup:
  1. cp deploy/.env.example deploy/.env   and fill in SSH_HOST + REMOTE_DIR.
  2. npx tsx deploy/index.ts pre-deploy   (prepare the server: node/pm2/toolchain)
  3. npx tsx deploy/index.ts deploy       (build & ship)

Commands:
  pre-deploy   Install Node, build toolchain, pm2; enable pm2-on-boot. Idempotent.
  deploy       rsync tree, push bot .env, npm ci (smart-skip), pm2 restart, register. (default)
  restart      pm2 restart, no sync/install.
  start        Start bots under pm2.
  stop         Stop bots (survives reboot).
  delete       Remove bots from pm2 (next deploy re-adds).
  status       pm2 status.
  logs         Tail pm2 logs (interactive).
  register     Re-register Discord slash commands.
  help         This message.

Bot runtime secrets live in bots/*/.env (pushed on deploy). deploy/.env is
only the deploy connection config.`);
}

// ---- entrypoint ------------------------------------------------------------
function main(): void {
  const cmd = (process.argv[2] || "deploy").toLowerCase();

  if (cmd === "help" || cmd === "--help" || cmd === "-h") {
    help();
    return;
  }

  const cfg = loadConfig();

  switch (cmd) {
    case "pre-deploy":
    case "predeploy":
      preDeploy(cfg);
      break;
    case "deploy":
      deploy(cfg);
      break;
    case "restart":
      restart(cfg);
      break;
    case "start":
      start(cfg);
      break;
    case "stop":
      stop(cfg);
      break;
    case "delete":
      del(cfg);
      break;
    case "status":
      status(cfg);
      break;
    case "logs":
      logs(cfg);
      break;
    case "register":
      register(cfg);
      break;
    default:
      die(`Unknown command: ${cmd}. Try: npx tsx deploy/index.ts help`);
  }
}

main();
