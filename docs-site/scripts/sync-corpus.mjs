// Render the repo's two hand-written source trees into the Docusaurus docs tree.
// Both sources stay the single source of truth; this script only *renders* them
// — it never writes back.
//
// TWO source trees here, not one — this repo predates the docs site and already
// had a hand-written manual under docs/. That is the *user-facing* manual (what
// each command does); corpus/wiki/ is the *maintainer's* synthesis (why it is
// shaped this way). Both are rendered, into separate sections, and neither is
// restated in the other.
//
//   corpus/wiki/*.md, corpus/log.md ─►  docs-site/docs/wiki/<slug>.md
//   docs/**/*.md                    ─►  docs-site/docs/manual/<path>.md
//                                        (frontmatter rewritten to Docusaurus's
//                                         keys, links resolved to file links
//                                         Docusaurus checks)
//
// Corpus pages are auto-discovered: every *.md under corpus/wiki/, plus
// status.md and log.md at the corpus root if present, minus the DENY set.
// Discovery rather than a hand-kept list, because a list drifts silently.
//
// The manual keeps its folder layout with one rename: a folder's README.md
// becomes the folder's page (docs/discord/trivia/README.md → manual/discord/
// trivia.md), and the top-level docs/README.md becomes manual/index.md, which
// Docusaurus serves at /manual/.
//
// Links are resolved against the SOURCE file's own directory, in either tree,
// and then re-expressed from the page's OUTPUT position. The README rename
// changes depth (docs/discord/README.md → manual/discord.md), so a link that is
// right on disk and on GitHub has to be rewritten to stay right on the site:
//   - a link to another rendered page (manual or wiki) becomes a relative file
//     link to its output (`../discord.md#anchor`), which Docusaurus resolves to
//     the right route under any baseUrl and reports at build time if missing;
//   - a link to anything else in the repo (a brief, source code, the README,
//     corpus/index.md) becomes a GitHub URL for the path it actually points at —
//     `tree/` for a directory, `blob/` for a file, `raw/` for an image.
//
// The generated files carry a "do not edit" banner and are gitignored. Run via
// `npm run sync-corpus` (also runs before `start` and `docs`).

const GITHUB_REPO = 'https://github.com/gandolh/just-a-bot'
const BRANCH = 'main'
// Sibling checkouts a page links into (`../../../<dir>/...`), keyed by the local
// directory name. A link that leaves the repo for a directory not listed here is
// reduced to its text, with a warning. This repo has none today.
const OTHER_REPOS = {}
// Corpus pages deliberately NOT published, by slug. A deny list rather than an
// allow list: a new page is published by default, and keeping one back is a
// decision someone wrote down. Links to a denied page fall through to GitHub.
const DENY = new Set([])

import { readFile, writeFile, mkdir, rm, readdir, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, resolve, relative, basename, posix, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const siteDir = resolve(here, '..')
const outRoot = resolve(siteDir, 'docs')

/** The nearest ancestor of the site that holds a corpus/ — no hard-coded depth. */
function findRepoRoot(from) {
  for (let dir = from; ; dir = dirname(dir)) {
    if (existsSync(resolve(dir, 'corpus'))) return dir
    if (dirname(dir) === dir) return undefined
  }
}

const repoRoot = findRepoRoot(siteDir)
const toPosix = (p) => p.split(sep).join('/')

/** Corpus pages to render: { src, out } as repo-relative / docs-relative paths. */
async function discoverCorpus() {
  const corpus = resolve(repoRoot, 'corpus')
  const pages = []
  const wikiDir = resolve(corpus, 'wiki')
  if (existsSync(wikiDir)) {
    const files = (await readdir(wikiDir)).filter((f) => f.endsWith('.md')).sort()
    for (const f of files) pages.push({ slug: basename(f, '.md'), src: `corpus/wiki/${f}` })
  }
  for (const root of ['status.md', 'log.md']) {
    // A corpus that keeps status in wiki/ already has a `status` slug.
    const slug = basename(root, '.md')
    if (existsSync(resolve(corpus, root)) && !pages.some((p) => p.slug === slug)) {
      pages.push({ slug, src: `corpus/${root}` })
    }
  }
  return pages
    .filter((p) => !DENY.has(p.slug))
    .map(({ slug, src }) => ({ kind: 'wiki', src, out: `wiki/${slug}.md` }))
}

/** Every .md under docs/, mapped to its renamed output under manual/. */
async function discoverManual() {
  const manualSrc = resolve(repoRoot, 'docs')
  if (!existsSync(manualSrc)) return []
  const pages = []
  for (const file of await walk(manualSrc)) {
    const rel = toPosix(relative(manualSrc, file))
    const slug =
      rel === 'README.md' ? 'index' : rel.replace(/\/README\.md$/, '').replace(/\.md$/, '')
    pages.push({ kind: 'manual', src: `docs/${rel}`, out: `manual/${slug}.md` })
  }
  return pages
}

/** Every .md under a directory, recursively, in a stable order. */
async function walk(dir) {
  const out = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name)
    if (entry.isDirectory()) out.push(...(await walk(full)))
    else if (entry.name.endsWith('.md')) out.push(full)
  }
  return out.sort()
}

/** Split leading `--- ... ---` frontmatter from a markdown body. */
function splitFrontmatter(raw) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw)
  if (!m) return { fm: {}, body: raw }
  const fm = {}
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_-]+):\s*(.*)$/.exec(line)
    if (kv) fm[kv[1]] = kv[2].trim()
  }
  return { fm, body: raw.slice(m[0].length) }
}

/** Pull the first `# H1` as the title, and strip it from the body. */
function extractTitle(body, fallback) {
  const m = /^#\s+(.+?)\s*$/m.exec(body)
  if (m && body.slice(0, m.index).trim() === '') {
    return { title: m[1].trim(), body: body.slice(m.index + m[0].length).replace(/^\r?\n/, '') }
  }
  return { title: fallback, body }
}

/**
 * Rewrite the relative links in one page. Fenced code blocks are left alone —
 * a `[x](y)` in an example is not a link.
 */
async function rewriteLinks(body, page, known, warnings) {
  // Split into prose and fenced blocks. Prose is matched as a whole, not line
  // by line, because link text wraps: `[brief\n74](../briefs/…)` is one link.
  const blocks = []
  let fence = null
  for (const line of body.split('\n')) {
    const open = /^\s*(`{3,}|~{3,})/.exec(line)
    const inCode = fence !== null || open !== null
    if (open) fence = fence === null ? open[1][0] : open[1][0] === fence ? null : fence
    const last = blocks.at(-1)
    if (last && last.code === inCode) last.lines.push(line)
    else blocks.push({ code: inCode, lines: [line] })
  }

  const out = []
  for (const { code, lines } of blocks) {
    let text = lines.join('\n')
    if (!code) {
      const matches = [...text.matchAll(/(!?)\[([^\]]*)\]\(([^)\s]+)(\s+"[^"]*")?\)/g)]
      for (const [whole, bang, label, target, title = ''] of matches) {
        const next = await rewriteTarget(target, page, known, bang === '!', warnings)
        if (next === null) text = text.replace(whole, () => label)
        else if (next !== target) text = text.replace(whole, () => `${bang}[${label}](${next}${title})`)
      }
    }
    out.push(text)
  }
  return out.join('\n')
}

/** A link from one output page to another, as a relative file link. */
function fileLink(fromOut, toOut, hash) {
  let rel = posix.relative(posix.dirname(fromOut), toOut)
  if (!rel.startsWith('.')) rel = `./${rel}`
  return `${rel}${hash}`
}

async function rewriteTarget(target, page, known, isImage, warnings) {
  if (/^([a-z][a-z0-9+.-]*:|#|\/)/i.test(target)) return target
  const [pathPart, anchor] = target.split('#')
  const hash = anchor ? `#${anchor}` : ''
  // Resolved against the source file's directory, as GitHub resolves it.
  const repoRel = posix.normalize(posix.join(posix.dirname(page.src), decodeURI(pathPart))).replace(/\/$/, '')

  if (repoRel.startsWith('..')) {
    const abs = resolve(repoRoot, repoRel)
    // `<sibling>/<path>` relative to the directory holding this checkout.
    const [sibling, ...rest] = toPosix(relative(dirname(repoRoot), abs)).split('/')
    if (OTHER_REPOS[sibling] && !sibling.startsWith('..')) {
      return `${OTHER_REPOS[sibling]}/blob/${BRANCH}/${rest.join('/')}${hash}`
    }
    warnings.push(`${page.src}: link leaves the repo, kept as text — ${target}`)
    return null
  }

  if (!isImage) {
    if (known.has(repoRel)) return fileLink(page.out, known.get(repoRel), hash)
    // A link to a folder whose README is rendered goes to the folder's page.
    if (known.has(`${repoRel}/README.md`)) return fileLink(page.out, known.get(`${repoRel}/README.md`), hash)
  }

  const abs = resolve(repoRoot, repoRel)
  let kind = 'blob'
  try {
    if ((await stat(abs)).isDirectory()) kind = 'tree'
  } catch {
    warnings.push(`${page.src}: link target does not exist — ${target}`)
  }
  // An image needs the raw bytes, not GitHub's HTML page for the file.
  if (isImage) return `${GITHUB_REPO}/raw/${BRANCH}/${repoRel}`
  return `${GITHUB_REPO}/${kind}/${BRANCH}/${repoRel}${hash}`
}

const yamlEscape = (s) => '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'

async function render(page, known, warnings) {
  const raw = await readFile(resolve(repoRoot, page.src), 'utf8')
  const { fm, body: afterFm } = splitFrontmatter(raw)
  const stem = basename(page.out, '.md')
  const fallbackTitle = stem.replace(/(^|-)([a-z])/g, (_, s, c) => (s ? ' ' : '') + c.toUpperCase())
  const { title, body } = extractTitle(afterFm, fallbackTitle)
  const description = (fm.summary || '').replace(/\s+/g, ' ').slice(0, 160)
  const updated = fm.updated ? ` · updated ${fm.updated}` : ''
  const banner =
    page.kind === 'wiki'
      ? [
          `:::note[Rendered from ${page.src}${updated}]`,
          'This page is generated from the project corpus and rewritten on every docs build. Edit the source in `corpus/`, not here.',
          ':::',
        ]
      : [`:::note[Rendered from ${page.src}]`, 'Generated on every docs build. Edit the source in `docs/`, not here.', ':::']

  const front = [
    '---',
    `title: ${yamlEscape(title)}`,
    description ? `description: ${yamlEscape(description)}` : null,
    'toc_max_heading_level: 3',
    '---',
    '',
    ...banner,
    '',
  ]
    .filter((l) => l !== null)
    .join('\n')

  const rendered = await rewriteLinks(body, page, known, warnings)
  const outFile = resolve(outRoot, page.out)
  await mkdir(dirname(outFile), { recursive: true })
  await writeFile(outFile, front + rendered.trimStart(), 'utf8')
}

async function main() {
  if (!repoRoot) {
    console.error(`sync-corpus: no corpus/ above ${siteDir} — is this a corpus-flow project?`)
    process.exit(1)
  }
  const wiki = await discoverCorpus()
  const manual = await discoverManual()
  // Repo-relative source path → docs-relative output path, for both trees, so a
  // manual page can link into the wiki and the wiki into the manual.
  const known = new Map([...wiki, ...manual].map((p) => [p.src, p.out]))

  // Fresh output each run so deleted source pages don't linger.
  for (const dir of ['wiki', 'manual']) {
    const abs = resolve(outRoot, dir)
    if (existsSync(abs)) await rm(abs, { recursive: true, force: true })
    await mkdir(abs, { recursive: true })
  }

  const warnings = []
  for (const page of [...wiki, ...manual]) await render(page, known, warnings)
  for (const w of warnings) console.warn(`  ! ${w}`)
  console.log(`sync-corpus: wrote ${wiki.length} page(s) → docs/wiki/`)
  console.log(`sync-corpus: wrote ${manual.length} manual page(s) → docs/manual/`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
