import { houseStyle } from "./vendor/house-style/eslint.config.js";

/**
 * The house config from the vendored house-style copy, given this repo's folders. Thin on purpose: the
 * compiler is the first gate, and the house adds only what it cannot see. The rules and the reason for
 * each are in the copy. `.mjs` because the root package.json is not a module.
 */
export default [
  ...houseStyle({
    root: import.meta.dirname,
    // Allowed to print: the Jukebox check is a CLI run by hand, and the logger is the one place the
    // bot writes to the console.
    console: ["bots/discord/src/jukebox/atrium/check.ts", "shared/src/logger.ts"],
    // The one reader of the environment: loadEnv, which bots/discord/src/env.ts calls with its schema.
    env: ["shared/src/env.ts"],
    // The tests run on node:test, not vitest.
    vitest: false,
    // docs-site is Docusaurus, with its own conventions; the data folders are the bots' local state.
    ignores: ["docs-site/**", "bots/data/**", "bots/discord/data/**"],
  }),
  {
    // Off for now (2026-11-11): without noUncheckedIndexedAccess the rule calls every `!` on an indexed
    // read unnecessary, and its fix strips them. When tsconfig.base.json turns that flag on, this goes.
    name: "just-a-bot/until-unchecked-index-access",
    files: ["**/*.ts"],
    rules: { "@typescript-eslint/no-unnecessary-type-assertion": "off" },
  },
];
