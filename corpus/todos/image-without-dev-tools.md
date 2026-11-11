---
title: The image installs the dev tools, because tsx is a devDependency
created: 2026-11-11
status: open
tags: [deploy, docker]
---

# The image installs the dev tools, because tsx is a devDependency

Found while building brief 18 (2026-11-11). The Dockerfile's `npm ci` keeps
devDependencies, because the bot runs under `tsx` and `tsx` is one. Brief 18
pinned the house tools (ESLint, Prettier, knip, dependency-cruiser and the
rest) as devDependencies, so they ship in the image too. As a stand-in for a
docker build, `npm ci --ignore-scripts` on the files the `deps` stage copies
went from 62 packages and 87 MB (`8c97077`) to 277 packages and 197 MB
(`422edee`).

The fix: move `tsx` to `dependencies` and run `npm ci --omit=dev` in the
image. The image would then be smaller than before brief 18. It needs a docker
build and one run of the bot after the deploy, so it is the owner's to walk.
