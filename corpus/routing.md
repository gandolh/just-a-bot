# Routing profile — just-a-bot

Read by the `orchestrate` skill (the work-intake front door).

## Skills

- **Implement skill:** plan-split-dispatch (for ≥3 independent chunks; else inline)
- **Review skill:** code-review
- **PR skill:** _none configured — user opens PRs manually_

## Intent routing

| If the request is…                                  | Route to                          |
| --------------------------------------------------- | --------------------------------- |
| capture an idea / "add a todo"                       | corpus-flow §1                    |
| "work on brief NN" / build a feature                 | corpus-flow §3 → plan-split-dispatch |
| "what does the wiki say about X"                     | corpus-flow §5 (query)            |
| review a diff/PR                                     | code-review skill                 |
| a music/`/play` issue                                | read [wiki/music.md](wiki/music.md) first |

## READ / SKIP / SKILLS

| Area               | READ                                             | SKIP                  |
| ------------------ | ------------------------------------------------ | --------------------- |
| Music / `/play`    | bots/discord/src/player.ts, commands/{play,queue,skip,stop,pause,resume,nowplaying}.ts | node_modules internals (read only when debugging the extractor) |
| A Discord command  | bots/discord/src/commands/<name>.ts + its feature dir under src/ | unrelated feature dirs |
| Shared utils       | shared/ (`@bots/shared`: logger, loadEnv)        | —                     |
| Env / config       | bots/discord/src/env.ts, ecosystem.config.cjs    | —                     |
