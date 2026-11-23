---
summary: The parked proposal (2026-11-23) for a public Romanian law Q&A web app built on lexifina/romania-law and Wicket - what it is, the architecture, two size tiers, risks, the first step - with what the owner settled (its own app, search and answers behind Ward) and what waits for the final refinement (brief 20, blocked).
updated: 2026-11-23
---

# Proposal: a Romanian law assistant

Written 2026-11-23 from [research-romania-law.md](research-romania-law.md). Kept here, beside the research, until the
app has a repo of its own. The working name is **Pravila**, after the old Romanian law codes (Pravila de la
Govora, 1640); the name is the owner's call.

**Parked on 2026-11-23.** The owner settled two things: it is a public web app of its own, not a just-a-bot
command, and searching and AI answers both sit behind Ward sign-in (this supersedes the open-search idea below
wherever they differ). Every other question waits for the owner's final refinement, held when the work starts.
Its first step is [brief 20](../briefs/blocked/20-a-romanian-law-index-and-a-recall-check.md), blocked until then.

## What it is

A question box for Romanian law. You ask in Romanian, with or without diacritics. It finds the articles that
answer and asks Wicket's model to answer from those articles only. You get a short answer, then the articles
themselves, each with its act, its article number, the day its wording last changed, the day the act was last
checked against the official portal, and a link to the portal's page. Every answer says it is general
information from the official text as of a date, not legal advice.

It answers "what does the law say", not "what should I do in my case". It keeps no questions or answers, the same
rule Wicket follows.

## Where the text comes from

[lexifina/romania-law](https://github.com/lexifina/romania-law): one Markdown file per article, every version
dated, official texts free of copyright (Legea 8/1996 art. 9 lit. b), Lexifina's arrangement CC0. Shown text
carries "Sursa: Portalul legislativ al Ministerului Justiției". EU texts are CC BY 4.0 and case law names people,
so both stay out.

The catch: upstream last published on 2026-11-08, and every act checked was marked `stale` in its own freshness
file. If it stays frozen, two other sources exist. The portal's own SOAP web service is the authoritative one, but
it did not answer upstream's pipeline in November 2026.
[scriptogre/romanian-law-data](https://github.com/scriptogre/romanian-law-data) rebuilds daily Parquet files from
the portal, but ships no licence file. The builder below is the only part that knows the source, so swapping it
later costs one module.

## Architecture

```
laptop                                   the box
------                                   -------
sparse clone of romania-law              Pravila (Fastify + SQLite, read-only file)
   |  builder: articles -> chunks           |  1. BM25 over FTS5 -> top 8 chunks
   v                                        |  2. POST /v1/jobs to Wicket: the question + the chunks
pravila.db (articles + FTS5 index)  --->    |  3. check every citation in the answer is one of the 8
   shipped by the deploy                    v  4. page: answer, then the articles with dates and links
```

- **Build on the laptop, ship a file.** A treeless, depth-1 sparse clone with `--sparse-index` cost about 215 MB
  and 74 s for four acts on 2026-11-23, half of it the root files cone mode always checks out; without the
  sparse index the git index alone is 207 MB. The box gets the
  built SQLite file only, no git clone.
- **Chunks.** One per article; articles over about 2 KB split at paragraph lines (p90 is 2.1 KB in the codes,
  the largest 39.6 KB). Each chunk starts with the act's name and article label, because the files carry no
  chapter headings. "Abrogat." articles are dropped.
- **Search.** SQLite FTS5 with diacritics folding (`unicode61 remove_diacritics 2`); Mercatus already searches
  its listings on FTS5 with diacritics folding (its `search.md`). No Romanian stemmer exists there. If
  just-a-bot's brief 20 shows vocabulary misses, add one Wicket call that rewrites the question into legal
  words before searching.
- **Answer.** One Wicket job per question, two with the rewrite. Eight chunks of 1-2 KB make a prompt of about
  3,000-5,000 tokens, far under Wicket's 1 MB body. The prompt asks for an answer in Romanian, from the given
  articles only, citing them as `[act art. N]`, and to say so when they don't answer. The app drops any citation
  that isn't among the eight before showing the answer. Don't rely on `format` until Wicket's todo on Ollama
  Cloud's structured outputs is settled.
- **Sign-in.** Ward, like the other apps, unless the owner wants it public.
- **Updates.** On the laptop: `git fetch --depth 1`, compare `git ls-tree -r` blob ids between the old and new
  commit for the chosen folders, rebuild the changed rows, redeploy the file. Not `git log --since`: acts added
  late carry their publish time as commit date.

## Size

| Tier | Acts | Text | Chunks | SQLite file, estimated |
| --- | --- | ---: | ---: | ---: |
| A. Constitution and 11 codes in force | 12 | 7.8 MB, measured | ~10,000 | ~20 MB |
| B. Every consolidated act in force | 3,592 | ~96 MB, extrapolated | ~90,000 | ~150-250 MB |

The file estimates assume an FTS5 index of 1 to 1.5 times the text; they are not measured. Tier A fits the box
without a thought. Tier B is a real share of a box that gets no extra storage, and its acts change more often.
Start with A plus a short hand-picked list: consumer protection (OG 21/1992, OUG 34/2014), housing (Legea
114/1996, Legea 196/2018), e-commerce (Legea 365/2002), data protection (Legea 190/2018).

Vectors only if measured misses justify them, and they cost more than storage. Wicket has no embeddings route,
Ollama Cloud embeddings are unverified, and Wicket dropped its model on the box on 2026-11-04. For
scale: 90,000 chunks at 384 dimensions in float32 is 138 MB, in int8 35 MB; at 768 dimensions, double.

## Risks

- **Stale law.** The biggest one. Upstream's index marks 45% of laws `pending-change`. Every answer shows the
  dates, and an act not checked in 30 days gets a visible warning.
- **Romanian quality.** Search recall is measured by brief 20; answer quality is not measured anywhere yet. Judge
  ten real answers before going further.
- **Wicket's queue.** One call at a time, shared with `/ask` and ro-housing. Fine for one person; a public page
  would need its own limit.
- **Unapplied court findings.** Some articles stand in the text with a Constitutional Court finding against part
  of them. The builder carries the act README's list and the answer flags it.

## The first step, and the order after it

1. **just-a-bot brief 20**: build tier A as a JSON file, run 20 everyday questions, measure top-5 recall. No
   command, no Wicket. Measured, not built, is a valid end.
2. If it passes: a `/lege` command in just-a-bot, with BM25 in memory and the answer through Wicket. This keeps
   the bot's JSON-only decision; the index is reference data, not state.
3. A new app only if the owner uses `/lege` and wants more: a page, tier B, longer answers, or friends without
   Discord.

A Wicket retrieval endpoint is the wrong home. Wicket is the one door to the model, holds no text at rest, and
would turn into a knowledge service. Lexifina's keyless hosted search (10 calls a minute, 100 a day per address,
terms unread) is fine to try by hand, but not to build on: every question would leave the estate.

## Owner decisions

1. Is it wanted, and for whom: you alone, the Discord server, or the public?
2. Start in just-a-bot (recommended) or as its own app now?
3. Which acts: tier A, tier A plus the hand-picked list (recommended), or tier B?
4. If romania-law stays frozen past the first build: wait, switch to the portal's web service, or try
   romanian-law-data despite its missing licence file?
5. If keyword search falls short: an LLM rewrite step (recommended first), or vectors, which need a model on
   the box or a cloud route nobody has checked?
6. The name.
