# `/img` — HTML → PNG renderer

## Goal

Render HTML-like templates to PNG images and attach them to chat replies.
Memes, leaderboard cards, quote cards, etc. — built on **Satori +
@resvg/resvg-js** (chosen for ~10 MB footprint vs Puppeteer's 300 MB
Chromium download).

v1 ships one user-facing command (`/img meme`) and an internal API
(`renderToPng(template, props)`) that other features (leaderboards,
quote book) can call to attach a styled image to their replies.

## Library choice

**Satori** ([npm](https://www.npmjs.com/package/satori)) renders a
JSX-like tree (or plain `{ type, props }` objects) to SVG, then
**@resvg/resvg-js** rasterizes the SVG to a PNG buffer. Used by Vercel's
OG image generation.

Pros: ~10 MB total deps, ~100 ms render, no Chromium, runs in Node 22
without a build step.

Cons: limited CSS subset (no z-index beyond layer order, no grid layout,
no JS). For meme/card/leaderboard images this is fine.

Sources:
- [satori on npm](https://www.npmjs.com/package/satori)
- [HTML to image developers guide 2026](https://www.dunetools.com/guides/html-to-image-developers/)

## Command surface

| Command | Effect |
| --- | --- |
| `/img meme top:<text> bottom:<text> [template:<name>]` | Generate a classic top/bottom-text meme. v1 templates: `classic` (Impact-style white with black stroke), `bonk`, `disaster-girl`. |
| `/img card title:<text> body:<text>` | Generic card image — good for quoting yourself or making announcements. |

Subcommands. The internal `renderToPng(template, props)` API is what
other features call; only `meme` and `card` get a public surface in v1.

## Architecture

```
bots/discord/src/img/
├── render.ts                ← renderToPng(node, opts): Promise<Buffer>
├── fonts.ts                 ← loaded font buffers
├── fonts/
│   ├── Inter-Regular.ttf
│   ├── Inter-Bold.ttf
│   └── Anton-Regular.ttf    ← Impact-style, OFL-licensed
├── templates/
│   ├── meme.ts              ← (props: { top, bottom, bgUrl }) => Node
│   ├── card.ts              ← (props: { title, body }) => Node
│   ├── leaderboard.ts       ← used by /top once that ships
│   └── quote-card.ts        ← used by /quote once /quote ships
└── attach.ts                ← buffer → Discord AttachmentBuilder helper
```

### `render.ts` skeleton

```ts
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { fonts } from './fonts.ts';

export async function renderToPng(
  node: SatoriNode,
  opts: { width: number; height: number },
): Promise<Buffer> {
  const svg = await satori(node, {
    width: opts.width,
    height: opts.height,
    fonts,
  });
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: opts.width } });
  return resvg.render().asPng();
}
```

### Template shape

Satori accepts React-style trees, but you can hand it plain objects
without a JSX runtime:

```ts
// templates/meme.ts
export function memeTemplate(props: { top: string; bottom: string; bg: string }) {
  return {
    type: 'div',
    props: {
      style: { width: '100%', height: '100%', display: 'flex', position: 'relative' },
      children: [
        { type: 'img', props: { src: props.bg, style: { ... } } },
        { type: 'div', props: { style: { ...topTextStyle }, children: props.top } },
        { type: 'div', props: { style: { ...bottomTextStyle }, children: props.bottom } },
      ],
    },
  };
}
```

(JSX with `tsx` + a `@jsxImportSource` would be nicer, but the project
runs TS directly via `tsx` with no JSX transform configured. Stick with
plain objects to avoid a build-step regression — flagged in
[docs/architecture.md](../architecture.md).)

### Attaching to a reply

```ts
import { AttachmentBuilder } from 'discord.js';

const png = await renderToPng(memeTemplate({ top, bottom, bg }), {
  width: 600,
  height: 600,
});
const attachment = new AttachmentBuilder(png, { name: 'meme.png' });
await interaction.reply({ files: [attachment] });
```

## Dependencies to add

In `bots/discord/package.json`:

```jsonc
{
  "dependencies": {
    // ...existing
    "satori": "^0.x",          // latest at implementation time
    "@resvg/resvg-js": "^2.x"
  }
}
```

`@resvg/resvg-js` ships native binaries per platform; verify
`linux-x64-gnu` is downloaded on the dev WSL setup before shipping.

## Fonts

Bundle two open-licensed fonts in `bots/discord/src/img/fonts/`:

- **Inter** (Regular + Bold) — body text. [SIL Open Font License](https://github.com/rsms/inter).
- **Anton** — Impact-style display font for memes. [SIL Open Font License](https://fonts.google.com/specimen/Anton).

Loaded once at startup into a module-level array. Document license
attribution in the eventual `docs/img/README.md`.

## Files to add / modify

**New:**
- `bots/discord/src/img/render.ts`
- `bots/discord/src/img/fonts.ts`
- `bots/discord/src/img/fonts/` (TTF files)
- `bots/discord/src/img/attach.ts`
- `bots/discord/src/img/templates/meme.ts`
- `bots/discord/src/img/templates/card.ts`
- `bots/discord/src/img/templates/_styles.ts` — shared style constants
- `bots/discord/src/commands/img.ts` — slash subcommands

**Modified:**
- `bots/discord/package.json` — `satori` + `@resvg/resvg-js`.
- `bots/discord/src/commands/index.ts` — register `/img`.

## Cross-feature hooks

Once `/img` ships, retrofit these:
- `/top` — add a `image:true` option that renders the leaderboard via
  `leaderboardTemplate`. Update [leaderboards.md](leaderboards.md).
- `/quote random` — add a `card:true` option that renders the quote on a
  card. Update [quote-book.md](quote-book.md).

## Open questions / non-goals

- **JSX in templates**: deferred. Plain object trees are uglier but
  preserve the no-build-step constraint. If we ever add a build step
  for other reasons, revisit.
- **Image background URLs for memes**: v1 = bundled local images
  (`bots/discord/src/img/assets/`). Don't fetch arbitrary URLs (SSRF +
  rate-limit risk).
- **User-uploaded templates**: no. Templates are code, not data.
- **GIF / animation**: no. Static PNG only.
- **Caching rendered images**: no in v1. Each `/img` call re-renders.
  Cheap enough at ~100 ms; revisit if abused.

## Done

Delete this file. Create `docs/img/README.md` covering:
- Library choice (Satori + resvg) with the size/speed rationale.
- Template authoring guide (plain object trees, font loading).
- License attribution for bundled fonts.
- The `renderToPng` API for other features to call.
- Cross-links to `/top` and `/quote` integrations once those land.
