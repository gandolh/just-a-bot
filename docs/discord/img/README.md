# `/img` — HTML-to-PNG renderer

Renders styled card and meme images as PNG attachments using **Satori** +
**@resvg/resvg-js**. Other features can call `renderToPng` directly to
produce image attachments without going through a `/img` slash command.

## Goal

Ship a two-subcommand surface (`/img meme`, `/img card`) backed by an
internal rendering API that leaderboard and quote-book features can call
once those land.

## Command surface

| Command | Effect |
| --- | --- |
| `/img meme top:<text> bottom:<text> [template:<name>]` | Top/bottom meme caption over a solid-color background. Templates: `classic` (black), `bonk` (brown), `disaster-girl` (dark red). |
| `/img card title:<text> body:<text>` | Announcement/quote card with a dark gradient background. |

Replies with a PNG file attachment. The interaction is deferred first so
render time (~100 ms) doesn't hit Discord's 3-second ACK deadline.

## How it works

### Library choice: Satori + @resvg/resvg-js

[Satori](https://github.com/vercel/satori) converts a React-style element
tree (or plain `{ type, props }` objects) into an SVG string. It does not
require a DOM, a browser, or a build step.

[@resvg/resvg-js](https://github.com/yisibl/resvg-js) rasterizes the SVG
to a PNG buffer using Rust's `resvg` library via a native Node.js addon.

Total footprint: ~10 MB of dependencies. Render time: ~100 ms. No Chromium
download required. Ships a prebuilt native binary for `linux-x64-gnu`
(the target platform for the bot).

Tradeoffs accepted: CSS subset only (no `z-index` stacking, no CSS Grid,
no JS). Sufficient for cards and memes.

### Plain object trees (no JSX)

The project runs TypeScript directly via `tsx` with no JSX transform
configured. Templates are plain `{ type, props }` objects. See
`docs/architecture.md` for the no-build-step rationale.

### Rendering pipeline

```
memeTemplate(props) → plain object tree
  ↓
renderToPng(tree, { width, height })
  ↓  satori → SVG string
  ↓  Resvg  → PNG buffer
pngAttachment(buf, 'meme.png')
  ↓
interaction.editReply({ files: [attachment] })
```

## Source layout

| Concern | Location |
| --- | --- |
| PNG renderer | [`bots/discord/src/img/render.ts`](../../../bots/discord/src/img/render.ts) |
| Font loading | [`bots/discord/src/img/fonts.ts`](../../../bots/discord/src/img/fonts.ts) |
| Bundled fonts | [`bots/discord/src/img/fonts/`](../../../bots/discord/src/img/fonts/) |
| Discord attachment helper | [`bots/discord/src/img/attach.ts`](../../../bots/discord/src/img/attach.ts) |
| Meme template | [`bots/discord/src/img/templates/meme.ts`](../../../bots/discord/src/img/templates/meme.ts) |
| Card template | [`bots/discord/src/img/templates/card.ts`](../../../bots/discord/src/img/templates/card.ts) |
| Shared style constants | [`bots/discord/src/img/templates/_styles.ts`](../../../bots/discord/src/img/templates/_styles.ts) |
| Slash command | [`bots/discord/src/commands/img.ts`](../../../bots/discord/src/commands/img.ts) |

## `renderToPng` API

Other features call this to produce PNG attachments:

```ts
import { renderToPng } from '../img/render.ts';
import { pngAttachment } from '../img/attach.ts';

const buf = await renderToPng(myTemplate(props), { width: 600, height: 340 });
await interaction.editReply({ files: [pngAttachment(buf, 'output.png')] });
```

`renderToPng` accepts any plain `{ type, props }` object tree that Satori
understands and returns a `Buffer` containing a PNG.

## Bundled fonts

Fonts are loaded once at module init from `src/img/fonts/` and reused for
every render call.

| File | Family | Weight | License |
| --- | --- | --- | --- |
| `Inter-Regular.ttf` | Inter | 400 | SIL Open Font License 1.1 |
| `Inter-Bold.ttf` | Inter | 700 | SIL Open Font License 1.1 |
| `Anton-Regular.woff` | Anton | 400 | SIL Open Font License 1.1 |

**Inter** is used for body text and card headings.
**Anton** is an Impact-style condensed display font used for meme captions.

License texts: [Inter](https://github.com/rsms/inter/blob/master/LICENSE.txt),
[Anton](https://fonts.google.com/specimen/Anton#license).

## Cross-feature hooks

- `/top` — once the leaderboard feature ships, add an `image:true` option
  that renders via a `leaderboardTemplate`. Update `docs/todo/leaderboards.md`.
- `/quote random` — once the quote-book feature ships, add a `card:true`
  option that wraps the quote in a card. Update `docs/todo/quote-book.md`.

## Design notes

- **Defer + editReply, not reply.** Satori + resvg takes ~100 ms. Deferring
  before rendering guarantees Discord's 3-second ACK window is met even
  under load.
- **Solid-color meme backgrounds.** v1 bundles no background images to
  avoid SSRF risk from arbitrary URL fetching and licensing questions around
  specific meme images. Background color encodes the template identity.
- **Templates are code, not data.** No user-uploadable templates. Adding a
  new template means adding a new `.ts` file and a choice entry in the
  slash command options.
