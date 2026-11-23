# Task 20: A Romanian law index and a recall check

From the romania-law research of 2026-11-23 ([research-romania-law.md](../../wiki/research-romania-law.md)).
A measure-first brief: "measured, not built" is a valid end.

**Wait for the owner's yes.** The owner asked whether a chatbot could answer questions on Romanian law. This brief
only measures whether plain keyword search finds the right article. Don't start it until the owner says the bot may
grow a law feature at all.

## Context

[lexifina/romania-law](https://github.com/lexifina/romania-law) holds Romania's law as one Markdown file per
article: `lege/2003/53/art-139.md` is Codul muncii art. 139. The first line is `# Articolul 139`, then one
paragraph or letter per line. Each act's `README.md` has its title, its official portal link and a table of
articles with each one's last-changed day. `data/acts.json` lists every primary act with its `status`. The official
texts are free of copyright (Legea 8/1996 art. 9 lit. b); Lexifina's arrangement is CC0. The repo is 6.5 GB, so
it is never cloned whole.

A `/lege` command would answer a member's question from the articles a search returns, through Wicket like
`/ask`. Before building it, we need to know whether keyword search finds the right article for questions asked in
everyday Romanian. Wicket has no embeddings route and runs one call at a time, so vectors are out for now. The
subset is small: the Constitution and 11 codes in force are 7,710 article files, 7.8 MB of text. That fits in the
bot's memory as reference data, which keeps [decisions.md](../../wiki/decisions.md)'s "JSON files on disk for all
state, no SQLite": the index is not state.

The 12 folders: `constitutie/1991`, `lege/2009/287` (Codul civil), `lege/2010/134` (procedură civilă),
`lege/2009/286` (Codul penal), `lege/2010/135` (procedură penală), `lege/2003/53` (Codul muncii),
`lege/2015/227` (Codul fiscal), `lege/2015/207` (procedură fiscală), `oug/2019/57` (Codul administrativ),
`lege/2008/46` (Codul silvic), `lege/2006/86` (Codul vamal), `lege/2020/21` (Codul aerian).

## Files you OWN

- A new feature dir `bots/discord/src/law/`: the builder, the search, the recall run, their tests and a small test
  fixture.
- `bots/discord/package.json` (two scripts), `knip.config.js` if the new entry points need listing.
- `docs/discord/law/README.md` (how to make the checkout, build the index, run the check).
- `corpus/wiki/status.md`, `corpus/log.md`, and the research page's "Not verified" list.

## Files you must NOT touch

- `bots/discord/.env` and `env.ts`: nothing here reads the environment. Don't run or register the bot.
- `commands/`: no command in this brief.
- Anything Wicket-related.

## What to do

1. **The checkout**, in `docs/discord/law/README.md`, for the owner or the builder to run outside the repo:
   `git clone --filter=tree:0 --depth 1 --no-checkout https://github.com/lexifina/romania-law.git`, then
   `git sparse-checkout init --cone --sparse-index`, `git sparse-checkout set <the 12 folders>`, and
   `git checkout main`. Measured on 2026-11-23: about 105 MB and 74 s for four acts. Leave out `--sparse-index`
   and the git index alone grows to 207 MB. Don't add `data` to the set: it holds 40,560 files of unmeasured
   size. Take the one table the builder needs with `git show HEAD:data/acts.json > acts.json` (13.4 MB). Record
   the checkout's `git rev-parse HEAD`.
2. **The builder**, `law/build.ts`, run as `npm run law:build -w @bots/discord -- <checkout>`. For each folder,
   read the act's title and portal link from `data/acts.json` and each article's last-changed day from the act's
   README table. Skip any article whose text is only "Abrogat." Split an article longer than 2,000 characters at
   paragraph lines into parts. Write one gitignored JSON file, `bots/discord/data/law/articles.json`, with the
   upstream SHA, the build date, and one entry per chunk: act id, act title, article label, part, text,
   last-changed day, portal link.
3. **The search**, `law/search.ts`: pure, no `discord.js`. BM25 (k1 1.2, b 0.75) over each chunk's act title,
   article label and text. Tokenise: lower-case, fold diacritics (ă â î ș ț and the cedilla forms ş ţ), split on
   anything not a letter or digit, drop a short list of Romanian stop words. No new dependency.
4. **The questions**, `law/questions.json`: 20 questions in everyday Romanian, each with its expected act and
   article(s). Spread them over at least six of the 12 acts. Write each question the way a member would ask it,
   and don't copy a phrase of three or more words from the article it targets. Open the article and confirm it
   answers the question before recording it. Five to start from, each still to be confirmed against the text:
   "Câte zile de concediu de odihnă am pe an?" (Codul muncii art. 145), "Care sunt zilele libere legale?" (Codul
   muncii art. 139), "Cât preaviz dau dacă îmi dau demisia?" (Codul muncii art. 81), "De la ce vârstă ești major?"
   (Codul civil art. 38), "În cât timp se prescrie o datorie?" (Codul civil art. 2517).
5. **The recall run**, `law/recall.ts`, run as `npm run law:recall -w @bots/discord`: load the JSON, run every
   question, and print for each the expected article's rank (or "not in top 20"), then recall@1, recall@5, the
   load time, the heap growth after loading, the file size, and the median search time.
6. **Tests** on a small hand-made fixture of six or so chunks, not the real index: folding (ş and ș match),
   ranking (the chunk that holds the rare word comes first), splitting, skipping "Abrogat.". `npm test` must not
   need the checkout.
7. Write the numbers into the outcome, the status page and the log.

## Acceptance

- [ ] `npm run law:build` on the checkout writes `articles.json`; the outcome gives its size, chunk count and the
      upstream SHA.
- [ ] `npm run law:recall` prints a rank for all 20 questions and the summary numbers.
- [ ] **Pass bar:** the expected article is in the top 5 for at least 16 of the 20 questions, the index loads in
      under 2 s and grows the heap by under 150 MB. Below the bar, the outcome lists each miss and its likely
      cause (vocabulary, folding, a split article) and ends "measured, not built".
- [ ] `npm run check` and `bash corpus/lint.sh` pass.

## Owner decisions

- Whether the bot gets a law feature at all (the gate above).
- If the bar passes: the next brief is the `/lege` command. It answers from the top articles through Wicket,
  cites act, article, the article's last-changed day and the portal link, and says on every answer that it is
  general information, not legal advice. Its name and who may use it are yours.
- If the bar fails: try an LLM rewrite of the question into legal words, one more Wicket call per question, before
  anything heavier. Or stop here.
