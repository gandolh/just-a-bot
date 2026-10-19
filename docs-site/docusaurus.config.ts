import type { Config } from '@docusaurus/types'
import type * as Preset from '@docusaurus/preset-classic'

/**
 * just-a-bot's documentation site.
 *
 * **Two rendered source trees, and that is the whole design of this one.** The
 * repo already had hand-written pages under `docs/` (the user-facing manual:
 * what each command does) alongside the corpus wiki pages (the maintainer's
 * synthesis: why it is shaped that way). Neither restates the other, so both are
 * rendered, into separate sections, by scripts/sync-corpus.mjs.
 *
 * The site itself lives in `docs-site/` rather than `docs/` precisely because
 * `docs/` was already taken by real content. The deployed URL is unaffected —
 * that comes from the estate's DocsSite construct, not from this directory name.
 *
 *   • Manual   → docs/**\/*.md            → docs-site/docs/manual/ → /manual/...
 *   • Wiki     → corpus/wiki/*.md, log.md → docs-site/docs/wiki/   → /wiki/...
 *   • Reference→ TypeDoc over @bots/shared → static/reference/      → /reference/
 *   • Diagrams → archify, from diagrams/   → static/diagrams/
 */

// The deployed base path, baked in rather than injected at deploy time.
//
// vps-deploy ships what this repo already built and VERIFIES this base — it does
// not set it. A variable the deploy passes that changes nothing is a variable
// that can silently disagree, whereas a value baked here and checked there
// cannot. Build with `npm run docs`; a wrong base fails the deploy by name
// instead of shipping a page whose every asset 404s.
//
// DOCS_BASE still overrides it, for building a copy to serve from somewhere else.
const baseUrl = process.env.DOCS_BASE ?? '/just-a-bot/docs/'

const config: Config = {
  title: 'just-a-bot',
  tagline: 'One repo, one bot, a lot of commands.',
  // The origin; only used for absolute URLs (sitemap, og tags). A placeholder:
  // the docs never name the production host.
  url: 'https://example.org',
  baseUrl,
  // Directory-style URLs (/wiki/overview/ → wiki/overview/index.html), which is
  // what a sub-path static deploy serves and what the Starlight site already used.
  trailingSlash: true,
  // Opt in to the v4 behaviour now (Docusaurus Faster, CSS cascade layers,
  // namespaced storage) so the v4 upgrade is a version bump, not a migration.
  future: { v4: true },
  onBrokenLinks: 'throw',
  onBrokenAnchors: 'warn',
  markdown: {
    // .md (the synced corpus and manual) parses as CommonMark, .mdx (the
    // hand-authored landing) as MDX. 'mdx' for everything breaks on prose: a
    // bare `<` or `{` is JSX.
    format: 'detect',
    hooks: { onBrokenMarkdownLinks: 'throw' },
  },
  i18n: { defaultLocale: 'en', locales: ['en'] },
  presets: [
    [
      'classic',
      {
        docs: {
          routeBasePath: '/', // docs-only site: no /docs/ prefix under the base
          sidebarPath: './sidebars.ts',
        },
        blog: false,
        theme: { customCss: './src/css/custom.css' },
      } satisfies Preset.Options,
    ],
  ],
  // Local, offline search (Starlight shipped Pagefind; Docusaurus ships nothing).
  themes: [
    [
      '@easyops-cn/docusaurus-search-local',
      { hashed: true, docsRouteBasePath: '/', indexBlog: false, indexPages: false },
    ],
  ],
  themeConfig: {
    // Dark only. The bot has one surface and it is not a light one (see
    // src/css/custom.css). With disableSwitch the inline script hard-codes the
    // mode: no toggle, and a stored preference is never read.
    colorMode: { defaultMode: 'dark', disableSwitch: true, respectPrefersColorScheme: false },
    navbar: {
      title: 'just-a-bot',
      items: [{ href: 'https://github.com/gandolh/just-a-bot', label: 'GitHub', position: 'right' }],
    },
  } satisfies Preset.ThemeConfig,
}

export default config
