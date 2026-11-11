import preset from "./vendor/house-style/knip.json" with { type: "json" };

// knip has no `extends`, so this spreads the house preset. Not in `npm run check` yet: run it by hand
// with `npx knip`. docs-site is Docusaurus, outside the house style; pm2 reads ecosystem.config.cjs;
// ffmpeg (the Jukebox) and codegraph (the code graph scripts) are programs on the PATH, not packages.
export default {
  ...preset,
  ignoreWorkspaces: ["docs-site"],
  ignoreBinaries: ["ffmpeg", "codegraph"],
  workspaces: { ".": { entry: ["scripts/*.{js,mjs,ts}", "ecosystem.config.cjs"] } },
};
