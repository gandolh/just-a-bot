---
summary: The 2026-11-23 look at lexifina/romania-law, Romania's law as a git history with one Markdown file per article. What it holds (the Constitution, the codes, 23,211 primary acts of which 3,592 are consolidated and in force, plus Government decisions, orders, local acts, EU acts and case law), how current it is (last data publish 2026-11-08, every act checked here marked stale), the licence (official texts free of copyright, Lexifina's arrangement CC0, EU texts CC BY 4.0), the fit table for the estate's repos, the sizes a law chatbot would index, what Wicket can do for one today (chat only, no embeddings), and why the first step is a measure-first index and recall check in this bot (brief 20).
updated: 2026-11-23
---

# Research: lexifina/romania-law

The owner asked on 2026-11-23 whether [lexifina/romania-law](https://github.com/lexifina/romania-law) is useful to
the estate's projects, and whether it could carry a chatbot that answers questions on Romanian law. This page is
the answer. Upstream files are cited as `path@sha`: romania-law at `2d4c02b` (2026-11-15), its parent
[lexifina/global-law](https://github.com/lexifina/global-law) at `bccd8e4` (2026-11-23). The repo is about 6.5 GB
and 1.9 million files, so it was read through partial clones, never checked out whole.

## Verdict

A good snapshot of Romanian law, not yet a feed to rely on. The text is clean, one article per file, with every
version dated and credited to the act that made it. But the last data publish was 2026-11-08, the official portal
was not answering upstream's pipeline then, and every act checked for this page is marked `stale` by upstream's own
freshness file. For the estate it is most useful today as a reference: checking our pages against it turned up wrong
law references on two of them (Mercatus brief 28, scoala-ramna brief 165). A law chatbot is feasible at a small size on the box, and
the cheap first step is a recall check in this bot ([brief 20](../briefs/todo/20-a-romanian-law-index-and-a-recall-check.md)).

## What is in it

**Layout.** Each act lives at `<kind>/<year>/<number>/`, one file per article: `lege/2003/53/art-139.md` is
Codul muncii art. 139, an inserted art. 15^1 is `art-015-1.md`. Codes live under their own act (Codul civil is
`lege/2009/287/`, Codul administrativ `oug/2019/57/`), the Constitution under `constitutie/1991/`. Kinds include
`lege`, `oug`, `og`, `hg`, `ordin`, `norma`, `regulament`, `decret`, `local/<council>`, `ue/`, `jurisprudenta/`
and `proiect/` for bills, which are labelled as not law (`README.en.md@2d4c02b`).

**Format.** An article file has no frontmatter. Its first line is `# Articolul N`, then one paragraph, letter or
point per line, as `(1) ...` and `a) ...`. Chapter and section headings and the portal's editorial notes are left
out. The metadata sits in three other places:

- the act's `README.md`: title, version count, first and latest in-force day, the official portal link, a table
  of articles with each one's change count and last-changed day, the decisions made by hand, and the
  Constitutional Court findings not applied to the text (`lege/2003/53/README.md@2d4c02b`);
- the commit trailers: `In-force:`, `Kind:`, `Law:`, `Enacted:`, `Published:`, `Source:`, `Consolidated:`,
  `Affecting:` (`AGENTS.md@2d4c02b`). Each commit is one act taking effect, authored by that act. Tags
  `<act-id>/<day>` mark the act as it stood from a day;
- `data/`: `acts.json` (one row per primary act with `status`, `versions`, `latest` and `portal`), `paths.json`,
  and the freshness shards `data/freshness/<kind>/<year>.csv`.

**Coverage**, from `README.en.md@2d4c02b` and `data/acts.json@2d4c02b`:

| Part | Count |
| --- | --- |
| Primary acts (laws, OUG, OG, decrees, decisions of Parliament, the codes) | 23,211 acts, 34,813 versions |
| of which consolidated and in force | 3,592 acts, 68,272 article files |
| amended, but held only as published | 7,837 |
| as published, amendments not yet checked | 7,390 |
| amending acts / repealed | 4,141 / 251 |
| Government decisions (HG) | 41,983 |
| Ministerial orders; norms and regulations of BNR, ASF, ANCOM and others | 40,746; 8,968 |
| Local council decisions | 375,166 from 1,341 of 3,229 councils |
| EU acts in Romanian; treaties | 16,409; 2,579 |
| Court decisions (mostly CCR, plus ÎCCJ RIL/HP, ECHR, CJEU) | 28,231 |

The codes held with their history include Codul civil (13 versions, latest 2026-05-03), Codul muncii (61,
2025-12-18), Codul penal (45, 2026-04-26), Codul fiscal (149, 2026-08-08), the two procedure codes and Codul
administrativ. A status of `in force` is not enough on its own: Legea 1/2011 is listed in force because one
article survives, and every other article reads "Abrogat." (`lege/2011/1/README.md@2d4c02b`).

**The parent.** global-law is a CC0 index of one repo per jurisdiction, linked as git submodules, with Python
tools (`law.py show|blame|diff`) and a local MCP server that reads a clone (`README.md@bccd8e4`,
`FAQ.md@bccd8e4`). Its own Romania page is blunt: only 6% of the primary acts have more than one version, 13,135
amended acts are held only as first published, and every essential code was last checked between June and
October 2026 (`romania/README.md@bccd8e4`).

## How current it is

- **Last data publish: 2026-11-08.** Of the last 300 commits on `main`, 289 were committed that day; the 11 after
  it, up to 2026-11-15, touch only the README and charts.
- **The official source was not answering.** `data/status.json@2d4c02b`, generated 2026-11-08, marks the portal's
  website unavailable to the pipeline since 2026-11-02 and its web service since 2026-11-08.
- **Every act checked here is stale.** Codul muncii, Codul civil, Legea 114/1996, 8/1996, 190/2018, 196/2018,
  148/2000, 158/2008, 365/2002, 198/2023, 199/2023, 1/2011, OG 21/1992 and OUG 34/2014 are all `stale`, last
  verified between 2025-12-15 and 2026-07-20 (`data/freshness/*/*.csv@2d4c02b`). Those dates come before the
  2026-10-28 retrieval, which fits texts read from web-archive captures (`LICENSE@2d4c02b`). That last part is an
  inference.
- **Known gaps.** Upstream's freshness index, as of 2026-11-08, marks 4,990 of 11,128 laws and 1,687 of 3,681 OUG
  as `pending-change`: the official source reports a change the repo doesn't have.

So any answer built on it must show the article's last-changed day and the act's last check. The README says
`data/status.json` is refreshed every hour; the copy at `2d4c02b` is dated 2026-11-08.

## Licence and credit

GitHub shows `NOASSERTION` because `LICENSE` is custom text, not a standard licence. What it says
(`LICENSE@2d4c02b`, `DATA.md@2d4c02b`):

- **Legal texts.** Official texts of normative acts, excluded from copyright by Legea 8/1996 art. 9 lit. b. Free
  to reuse. Upstream labels them "Sursa: Portalul legislativ al Ministerului Justiției, https://legislatie.just.ro";
  we keep that line wherever we show text. The Ministry does not endorse the repo.
- **Lexifina's arrangement, commit messages, tables and tools.** CC0 1.0. No credit needed; a courtesy line
  ("via lexifina/romania-law") costs nothing.
- **EU texts in `ue/` and CJEU decisions.** © European Union, Commission Decision 2011/833/EU, CC BY 4.0.
  Attribution required. Left out of any first step.
- **Case law and local acts.** Personal data was removed, but decisions name people. Left out.
- global-law itself is CC0 (`LICENSE.md@bccd8e4`). Upstream says an AI model wrote its scripts and that no model
  wrote, translated or corrected legal text (`README.en.md@2d4c02b`).

## Quality notes for search

- Clean text: cedilla letters normalised to comma-below, one paragraph per line.
- Some words lost their hyphen. In 9.6 MB of sampled articles, "întrun" appears 95 times beside 641 "într-un",
  and "dintrun" 3 times beside 143 "dintr-un".
- A marginal title can fuse into paragraph (1): OUG 34/2014 art. 16 starts "(1) Exceptări de la dreptul de
  retragere".
- No chapter headings, so each chunk needs the act's name and the article number put in front of it.
- Article sizes, measured on the Constitution and 11 codes (7,710 files): median 542 bytes, p90 2.1 KB, p99
  8.9 KB, largest 31 KB. In 60 random in-force laws (925 files) the median is 698 bytes and the largest 39.6 KB.
  Split articles over about 2 KB at paragraph lines.
- Constitutional Court findings that don't change the words are listed per act and in `data/court-notes.csv`.
  An answer quoting such an article must say so.

## Fit with the estate

| Project | What the data gives it | Verdict |
| --- | --- | --- |
| just-a-bot | A corpus for a `/lege` question command, through Wicket like `/ask` | Brief 20: index plus recall check, measure first |
| wicket | Nothing to add; it stays the generation step. Chat only, no embeddings route, strict body, one call at a time | No brief. A todo: check `format` on Ollama Cloud |
| comercial-website | Termeni cites "GEO 141/2021" for the 14-day withdrawal right; the right is OUG 34/2014 art. 9, its digital-content exception art. 16(1)(m) with three conditions, and the page lists two. Its "SAL" link is the EU ODR platform, abolished 2025-07-20 by Regulamentul (UE) 2024/3228 | Brief 28 |
| scoala-ramna (theme) | Informații publice labels Legea 198/2023 "Legea educației naționale", the name of the repealed Legea 1/2011, and offers as-published PDFs of laws amended since: 198/2023 from 2023-07-05 (record: 15 versions), 153/2017 from 2017-06-28 (26 versions) | Brief 165 |
| almanac | Codul muncii art. 139 names the public holidays and its history. It gives names, not dates: Easter and Rusalii need a computed Orthodox date | None now; "No import; events are typed in" is locked |
| ro-housing | A buyer's tool for flats for sale, not rentals. Codul civil on sale, Legea 7/1996 (land book) and Legea 196/2018 (owners' associations) are reading, not features | None |
| gazette | Prints no law citations. Advertising disclosure rules (Legea 148/2000) apply to the posts, not to the report | None |
| wzd_auth (Ward) | Prints no law citations. Legea 190/2018 adds rules on health, biometric and national ID data and workplace monitoring; Ward handles none of them | None |

Each "None" was checked by a grep of the repo's code for law citations; only the two briefs' pages turned any up.

## A law chatbot, sized

The full proposal is outside this repo; these are the numbers it rests on.

| Subset | Articles | Text | Chunks (split at ~2 KB) |
| --- | ---: | ---: | ---: |
| Constitution and 11 codes in force | 7,710 | 7.8 MB, measured | about 10,000 |
| All consolidated acts in force | 68,272 | about 96 MB, extrapolated from the sample | about 90,000 |

Excluded on purpose: the 15,227 acts held only as published (their text is likely out of date), amending acts,
"Abrogat." articles, case law and EU texts.

**Wicket today.** It sends Ollama's `/api/chat` and nothing else, takes `{ messages, format? }` only, and runs one
call at a time, per wicket's `api.md` and `providers.md`. There is no embeddings route. Whether Ollama Cloud serves an
embedding model is unverified: its cloud page lists none (docs.ollama.com/cloud, fetched 2026-11-23). Embedding
90,000 chunks one at a time through the same queue as `/ask` would block it for hours, so vectors are not the
first step. Plain BM25 over the 7.8 MB subset fits in this bot's memory and respects the "JSON files on disk, no
SQLite" decision in [decisions.md](decisions.md): the index is reference data loaded at start, not state.

**Romanian.** No stemmer ships with the usual search tools for Romanian. Folding diacritics and lower-casing gets
part of the way; an LLM rewrite of the question into legal words is the next lever. How well gpt-oss:120b answers
in Romanian on legal text is unmeasured.

**Updates.** Measured on 2026-11-23: a treeless, depth-1 clone with cone-mode sparse checkout and a sparse index,
for four acts, costs 105 MB of objects (every tree of 1.9 million paths comes down) and about 74 seconds. Without
`--sparse-index` the git index alone is 207 MB. So the index is built on the laptop and shipped as a file; the box
gets no git clone. Between two snapshots, compare `git ls-tree -r` blob ids for the chosen folders and re-index
only the changed articles. Don't use `git log --since`: acts added late carry their publish time as commit date
(`AGENTS.md@2d4c02b`).

**Citations.** Each answer names the act, the article, the article's last-changed day (the act README's table),
the act's last check (the freshness CSV), and the official portal link (`acts.json`). No git history is needed at
answer time.

**Framing.** A line on every answer: general information from the official text as of a date, not legal advice,
check the official page. The bot answers what the text says, not what a member should do in their case.

**Hosted alternative.** Lexifina runs a keyless search API (`global-law.lexifina.com/v1/search_law`) that returns
provisions with `in_force`, `last_change` and `official_url`. Its own notice limits it to 10 calls a minute and
100 a day per address, its FAQ says there is no hosted API (`FAQ.md@bccd8e4`), and its terms of use were not read.
Every question would go to a third party. Fine for the owner to try by hand, not a base to build on.

Another dataset, [scriptogre/romanian-law-data](https://github.com/scriptogre/romanian-law-data), rebuilds Parquet
files daily from the same portal (`README.md@885a04d`), but it ships no licence file. It is worth a look if
romania-law stays frozen.

## Not verified

- Whether romania-law resumes publishing, and whether a rebuild rewrites history (its build is deterministic per
  `README.en.md@2d4c02b`, but a layout move already renamed folders once).
- Ollama Cloud embeddings; the hosted API's terms; search quality in Romanian, which brief 20 measures.
- The in-force set's size beyond the 60-act sample.
