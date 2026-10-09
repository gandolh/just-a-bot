# just-a-bot docs

Start with the [main README](../README.md). This folder is the bot's operating manual: what each feature does, how to set it up, which env vars it needs, and how to triage it when it breaks. Each page is written once per feature and revisited when that feature changes.

## This is the how, not the why

The why lives in [`corpus/`](../corpus/index.md): locked decisions with their reasons, dated status, open questions, and the todos, briefs and log that record the work. The corpus is updated as work lands, so when the two disagree the corpus wins, and the code wins over both. Treat a claim here about current behavior as a lead, not a fact.

If you are an agent orienting in this repo, start at [corpus/index.md](../corpus/index.md), not here.

## Pages

| File | What it covers |
|---|---|
| [common/setup.md](common/setup.md) | Install, typecheck, tests, the repo layout, how env vars are loaded |
| [common/architecture.md](common/architecture.md) | The workspaces, the no-build runtime, the source layout, JSON persistence |
| [discord/README.md](discord/README.md) | The bot's feature index |
| [discord/setup.md](discord/setup.md) | Token and env vars, the Jukebox's variables, registering commands, running, the data files |
| [discord/architecture.md](discord/architecture.md) | Interaction routing, button prefixes, data paths |
| [images/](images/shots.md) | The images used in the main README, and how each was made |

One guide per feature, under `discord/`:

| Guide | Commands |
|---|---|
| [gambling](discord/gambling/README.md) | `/coins` `/give` `/slots` `/blackjack` `/blackjack2` `/dice` `/dice2` |
| [rpg](discord/rpg/README.md) | `/rpg` |
| [leaderboards](discord/leaderboards/README.md) | `/top` |
| [quotes](discord/quotes/README.md) | `/quote` and the Save Quote message menu |
| [reminders](discord/reminders/README.md) | `/remindme` `/birthday` |
| [hangman](discord/hangman/README.md) | `/hangman` |
| [trivia](discord/trivia/README.md) | `/trivia` |
| [img](discord/img/README.md) | `/img` |
| [mafia](discord/mafia/README.md) | `/mafia` |
| [confessions](discord/confessions/README.md) | `/confess` |
| [clock](discord/clock/README.md) | `/clock` |
| [connect-four](discord/connect-four/README.md) | `/c4` `/c42` |
| [wordle](discord/wordle/README.md) | `/wordle` |
| [tictactoe](discord/tictactoe/README.md) | `/tictactoe` |
| [ask](discord/ask/README.md) | `/ask` |
| [jukebox](discord/jukebox/README.md) | `/jukebox` |

The split mirrors the source tree. Anything Discord-specific lives under `discord/`, anything repo-wide under `common/`.

## Going deeper

- Docs site: <https://gandolh.ro/just-a-bot/docs/> renders these pages under "Manual" and the corpus wiki beside them. It is built from [`docs-site/`](../docs-site/) with `npm run docs -w @bots/docs-site`.
- Project wiki: [corpus/index.md](../corpus/index.md), with decisions, status, the glossary and the work log.
