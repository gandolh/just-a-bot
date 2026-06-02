// Zero-dependency helpers for the deploy tool. Only Node built-ins.
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync, readSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Repo root is the parent of this deploy/ directory.
export const DEPLOY_DIR = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(DEPLOY_DIR, "..");

// ---- tiny ANSI logging -----------------------------------------------------
const c = (code: string) => (s: string) =>
  process.stdout.isTTY ? `\x1b[${code}m${s}\x1b[0m` : s;
const bold = c("1");
const dim = c("2");
const red = c("31");
const green = c("32");
const cyan = c("36");

export const log = {
  step: (m: string) => console.log(bold(cyan(`>> ${m}`))),
  info: (m: string) => console.log(dim(`   ${m}`)),
  ok: (m: string) => console.log(green(`   ${m}`)),
  warn: (m: string) => console.warn(`   ${red("WARNING")}: ${m}`),
  err: (m: string) => console.error(red(`!! ${m}`)),
};

export function die(message: string): never {
  log.err(message);
  process.exit(1);
}

// Block until the user presses Enter (synchronous, fits the script's style).
// Reads a line from stdin; on a non-interactive stdin (e.g. piped/CI) it
// returns immediately so the run never hangs unattended.
export function pause(message: string): void {
  process.stdout.write(`${message} `);
  if (!process.stdin.isTTY) {
    process.stdout.write("(stdin not a TTY — continuing)\n");
    return;
  }
  const buf = Buffer.alloc(1024);
  try {
    while (true) {
      const n = readSync(0, buf, 0, buf.length, null);
      if (n === 0) break; // EOF
      if (buf.subarray(0, n).includes(0x0a)) break; // newline (Enter)
    }
  } catch {
    // EAGAIN etc. on some stdin setups — don't block the deploy.
  }
}

// ---- .env parsing (no dependency) ------------------------------------------
// Supports KEY=value lines, # comments, optional surrounding quotes.
export type Env = Record<string, string>;

export function parseEnv(text: string): Env {
  const out: Env = {};
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

export function loadConfig(): Config {
  const envPath = resolve(DEPLOY_DIR, ".env");
  if (!existsSync(envPath)) {
    die(
      `deploy/.env not found. Copy deploy/.env.example to deploy/.env and fill it in.`,
    );
  }
  const e = parseEnv(readFileSync(envPath, "utf8"));

  const sshHost = e.SSH_HOST || "";
  const sshHostname = e.SSH_HOSTNAME || "";
  if (!sshHost && !sshHostname) {
    die("deploy/.env must set either SSH_HOST (an ssh alias) or SSH_HOSTNAME.");
  }

  const remoteDir = e.REMOTE_DIR || "~/just-a-bot";
  const nodeMajor = e.NODE_MAJOR || "22";
  const envFiles = (e.ENV_FILES || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    sshHost,
    sshUser: e.SSH_USER || "",
    sshHostname,
    sshIdentityFile: e.SSH_IDENTITY_FILE || "",
    sshPort: e.SSH_PORT || "",
    remoteDir,
    nodeMajor,
    envFiles,
  };
}

export interface Config {
  sshHost: string;
  sshUser: string;
  sshHostname: string;
  sshIdentityFile: string;
  sshPort: string;
  remoteDir: string;
  nodeMajor: string;
  envFiles: string[];
}

// Build the ssh "destination" plus extra args. When SSH_HOST is set we lean on
// ~/.ssh/config (the simple path). Otherwise we assemble user@host with flags.
export function sshTarget(cfg: Config): { dest: string; opts: string[] } {
  if (cfg.sshHost) {
    const opts: string[] = [];
    if (cfg.sshPort) opts.push("-p", cfg.sshPort);
    if (cfg.sshIdentityFile) opts.push("-i", cfg.sshIdentityFile);
    return { dest: cfg.sshHost, opts };
  }
  const dest = cfg.sshUser ? `${cfg.sshUser}@${cfg.sshHostname}` : cfg.sshHostname;
  const opts: string[] = [];
  if (cfg.sshPort) opts.push("-p", cfg.sshPort);
  if (cfg.sshIdentityFile) opts.push("-i", cfg.sshIdentityFile);
  return { dest, opts };
}

// ---- process runners -------------------------------------------------------
// Run a local command, inheriting stdio. Throws on non-zero unless allowFail.
export function run(
  cmd: string,
  args: string[],
  opts: { cwd?: string; allowFail?: boolean; quiet?: boolean } = {},
): number {
  if (!opts.quiet) log.info(dim(`$ ${cmd} ${args.join(" ")}`));
  const r = spawnSync(cmd, args, {
    cwd: opts.cwd ?? REPO_ROOT,
    stdio: "inherit",
  });
  const code = r.status ?? 1;
  if (code !== 0 && !opts.allowFail) {
    die(`command failed (exit ${code}): ${cmd} ${args.join(" ")}`);
  }
  return code;
}

// Run a command and capture stdout (trimmed). Used for the lockfile hash probe.
export function capture(
  cmd: string,
  args: string[],
  opts: { allowFail?: boolean } = {},
): string {
  const r = spawnSync(cmd, args, { cwd: REPO_ROOT, encoding: "utf8" });
  if ((r.status ?? 1) !== 0 && !opts.allowFail) {
    die(`command failed: ${cmd} ${args.join(" ")}\n${r.stderr ?? ""}`);
  }
  return (r.stdout ?? "").trim();
}

// Run a remote command over ssh inside a login shell, stdio inherited.
export function ssh(
  cfg: Config,
  remoteCmd: string,
  opts: { tty?: boolean; allowFail?: boolean } = {},
): number {
  const { dest, opts: sshOpts } = sshTarget(cfg);
  const args = [...sshOpts];
  if (opts.tty) args.push("-t");
  // bash -lc gives a login shell so PATH includes /usr/bin (node/npm/pm2).
  args.push(dest, `bash -lc ${shellQuote(remoteCmd)}`);
  return run("ssh", args, { allowFail: opts.allowFail });
}

// Capture remote stdout over ssh (no inherited stdio).
export function sshCapture(cfg: Config, remoteCmd: string): string {
  const { dest, opts: sshOpts } = sshTarget(cfg);
  const r = spawnSync(
    "ssh",
    [...sshOpts, dest, `bash -lc ${shellQuote(remoteCmd)}`],
    { encoding: "utf8" },
  );
  return (r.stdout ?? "").trim();
}

// Single-quote a string for safe embedding in a remote shell command.
export function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

// rsync destination string: "<dest>:<path>" using the same dest as ssh.
export function rsyncDest(cfg: Config, remotePath: string): string {
  const { dest } = sshTarget(cfg);
  return `${dest}:${remotePath}`;
}

// The `-e ssh ...` transport string rsync should use, mirroring ssh opts.
export function rsyncSshTransport(cfg: Config): string {
  const { opts } = sshTarget(cfg);
  return ["ssh", ...opts].join(" ");
}
