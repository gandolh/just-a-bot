---
title: "README images"
tableOfContents:
  maxHeadingLevel: 3
---

:::note[Rendered from `docs/images/shots.md`]
Generated on every docs build. Edit the source in `docs/`, not here.
:::
How each image and sample in the main README was made, so the next refresh is a re-run. Nothing here is a screenshot of Discord. That would need the bot running against a test application, and these were made without one.

| File | Shows | How it was made | Size | Data | Made |
|---|---|---|---|---|---|
| command-flow.svg | How a slash command moves through the bot, and the other ways in | Hand-written SVG; the file is its own source. Check it against `bots/discord/src/index.ts` when routing or timers change | 1200×720 viewBox | none | 2026-10-09 |
| img-card.webp | What `/img card` posts | The bot's own renderer, run outside Discord (see below), then `ffmpeg -i card.png -c:v libwebp -quality 90 img-card.webp` | 600×340, the size the bot posts | made-up title and body | 2026-10-09 |

The `/slots` reply in the README is text, made the same way.

## Running a handler outside Discord

Never import the command registry from the repo itself for this. `env.ts` loads `bots/discord/.env`, and on a machine that deploys, that file holds production's token. Work on a copy instead:

1. Copy `bots/discord/src` and `bots/discord/package.json` into a scratch folder at `<scratch>/bots/discord/`, and symlink the repo's `node_modules` to `<scratch>/node_modules`. The copy has no `.env` beside it, so nothing reads the real one. Its `data/` writes land in the scratch folder too.
2. In a script inside the copied `src/`, set `DISCORD_TOKEN=dummy`, `CLIENT_ID=1` and `GUILD_ID=1` on `process.env` before any import, then import what you need.
3. Run it with the repo's tsx: `<repo>/node_modules/.bin/tsx src/<script>.ts`.

For the `/slots` text, call `execute()` on `coins` and then `slots` with a stub interaction:

```ts
const stub = (sub: string | null, ints: Record<string, number>) => ({
  user: { id: 'demo-user' },
  options: { getSubcommand: () => sub, getInteger: (n: string) => ints[n] },
  reply: async (x: any) => console.log(x.content),
}) as any;
await coins.execute(stub('add', { amount: 1000 }));
await slots.execute(stub(null, { bet: 50 }));
```

Each run spins anew. The README shows one real run that hit a winning line.

For the card, render it the way `commands/img.ts` does before uploading:

```ts
const buf = await renderToPng(cardTemplate({ title, body }), { width: 600, height: 340 });
```

## Checking at phone width

Render each image 360 px wide and read it. For the SVG, open it in a browser inside a 360 px wide `<img>`. The five boxes of the main path stay readable at that size; the "Other ways in" rows only read as shape, and the README's "How it works" section says the same things in text.
