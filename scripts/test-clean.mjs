// `npm run test:clean`: the workspaces' tests, run in a copy of the repo that holds no `.env` file.
//
// bots/discord/src/env.ts loads bots/discord/.env when any module imports it, and in a working
// checkout that file holds the bot's real credentials. Two tests import it. So the tests never run
// in the checkout: this copies the repo into an operating-system temporary folder without any
// `.env*` file, without docs-site and without git-ignored state (node_modules, the bots' data/),
// gives the copy its own node_modules folder, and runs `npm test` there. With no `.env` in the copy,
// those two tests read nothing from disk and use the dummy variables they set themselves.
import { execFileSync, spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, sep } from "node:path";

const repo = join(import.meta.dirname, "..");

/** `.env`, `.env.local`, `.env.example`: none of them goes into the copy. */
const isEnvName = (name) => name.startsWith(".env");

/**
 * The files to copy: tracked ones, and untracked ones git doesn't ignore, so a test written but not
 * yet committed still runs. Git ignores node_modules, the bots' data and `.env`; node_modules (which
 * git lists when it is a symlink), docs-site and every `.env*` name (`.env.example` is tracked) are
 * dropped here.
 */
function filesToCopy() {
  const listed = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
    cwd: repo,
    encoding: "utf8",
  });
  return listed
    .split("\0")
    .filter(Boolean)
    .filter((file) => {
      const parts = file.split("/");
      return !["docs-site", "node_modules"].includes(parts[0]) && !parts.some(isEnvName);
    });
}

/** Every path in the copy whose name starts with `.env`. Symlinks are not followed. */
function envFilesIn(dir) {
  const found = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (isEnvName(name)) found.push(path);
    if (lstatSync(path).isDirectory()) found.push(...envFilesIn(path));
  }
  return found;
}

/**
 * The copy's node_modules is a folder of links to the checkout's packages, except the workspaces:
 * the checkout's `@bots/*` links point back into the checkout, so the copy gets its own, pointing at
 * its own `shared` and `bots/discord`. Otherwise `@bots/shared` would load the checkout's source.
 */
function linkNodeModules(copy) {
  const from = join(repo, "node_modules");
  const to = join(copy, "node_modules");
  mkdirSync(to);
  for (const name of readdirSync(from)) {
    if (name === "@bots") continue;
    symlinkSync(join(from, name), join(to, name));
  }
  mkdirSync(join(to, "@bots"));
  symlinkSync(join(copy, "shared"), join(to, "@bots", "shared"));
  symlinkSync(join(copy, "bots", "discord"), join(to, "@bots", "discord"));
}

const copy = mkdtempSync(join(tmpdir(), "just-a-bot-tests-"));
let status = 1;
try {
  for (const file of filesToCopy()) {
    const source = join(repo, file);
    // A file deleted in the working tree is still listed until the deletion is committed. Only
    // regular files are copied: a symlink could point anywhere, a .env included.
    if (!existsSync(source) || !lstatSync(source).isFile()) continue;
    mkdirSync(dirname(join(copy, file)), { recursive: true });
    copyFileSync(source, join(copy, file));
  }

  // The guard does not trust the filter above: it looks at what actually landed in the copy.
  const envFiles = envFilesIn(copy);
  if (envFiles.length > 0) {
    console.error(`test:clean: refusing to run, the copy holds .env files:\n  ${envFiles.join("\n  ")}`);
  } else {
    linkNodeModules(copy);
    const inside = realpathSync(copy) + sep;
    const outside = ["shared", "discord"]
      .map((name) => realpathSync(join(copy, "node_modules", "@bots", name)))
      .filter((path) => !path.startsWith(inside));
    if (outside.length > 0) {
      console.error(`test:clean: refusing to run, a workspace resolves outside the copy: ${outside.join(", ")}`);
    } else {
      console.log(`test:clean: running the tests in ${copy}`);
      const run = spawnSync("npm", ["test"], { cwd: copy, stdio: "inherit", shell: process.platform === "win32" });
      status = run.status ?? 1;
    }
  }
} finally {
  rmSync(copy, { recursive: true, force: true });
}
process.exit(status);
