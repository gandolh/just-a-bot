> **SUPERSEDED 2026-08-27, before it was ever executed.** Hours after this brief
> was written the user widened the scope: remove *every* external music library,
> not just yt-dlp. That made this brief's central instruction — keep the youtubei
> extractor and warn that `YOUTUBE_ENABLED` no longer works — moot, because the
> flag, the extractor and the whole subsystem went too. The wider work was done
> directly; see the 2026-08-27 `music removed` entry in `log.md` and the
> "Music subsystem removed entirely" decision. Kept unedited below for the trail.

# Task 03 — Remove the yt-dlp streaming path

## Context

Music is on an **active hold**: the user is researching either a different
provider or a way to make YouTube play smoothly **without cookie forgery**
(cookies are ruled out — ~2-week manual refresh). Nothing in the repo currently
runs yt-dlp: it is called only inside `if (YOUTUBE_ENABLED)`, and
`YOUTUBE_ENABLED = false`, inside a feature whose seven commands are commented
out. It is dead code twice over, plus a 3 MB dependency with a bundled binary.

Scope was decided deliberately: **remove the yt-dlp half only.** Removing the
whole YouTube secondary (the youtubei extractor too) was offered and declined.

Decision and rationale: the "Revisited 2026-08-27" block under
"Music source: SoundCloud primary, YouTube a disabled secondary" in
[decisions.md](../../wiki/decisions.md).

## Files you OWN

- `bots/discord/src/player.ts` — remove `import youtubeDl from 'youtube-dl-exec'`
  (line 7), the `@deprecated streamWithYtDlp` function (~lines 28-68), and the
  `createStream: (track) => streamWithYtDlp(track)` option inside the
  `if (YOUTUBE_ENABLED)` registration (~line 91). Also drop the now-unused
  `import type { Readable } from 'node:stream'` and `type Track` import if
  nothing else uses them.
- `bots/discord/src/env.ts` — remove `YT_COOKIES_FILE` and its two-line comment
  (~lines 14-16). **Keep `YT_COOKIE`** — that is the header string for the
  youtubei metadata extractor, which stays.
- `bots/discord/package.json` — remove the `youtube-dl-exec` dependency.
  **Keep `discord-player-youtubei`.**
- root `package.json` — remove the `music:update-ytdlp` script.
- `package-lock.json` — refresh via `npm install`.

## Files you must NOT touch

- `bots/discord/src/commands/*` — the music commands stay commented out exactly
  as they are; this brief does not un-shelve or further shelve anything
- `bots/discord/src/dicetable/`, `shared/` — brief 02 owns those
- The `YOUTUBE_ENABLED` flag itself, the `YoutubeExtractor` registration, and
  `YT_COOKIE` — all stay

## What to do

1. Make the edits above.
2. **Rewrite the provider comment block at the top of `player.ts` (~lines 13-20)
   so it does not lie.** It currently says the YouTube code is "kept and marked
   `@deprecated`; flip `YOUTUBE_ENABLED` to re-enable once that's resolved". That
   becomes false: with no `createStream` override, the youtubei extractor resolves
   metadata and produces **no audio** (SABR/PO-token enforcement — the original
   2026-06-26 bug). The comment must state plainly that flipping the flag alone
   will *not* work and that a new stream source is required first. This is the
   single most important line in the brief: it is the trap a future reader would
   otherwise walk into.
3. `npm install`, then `grep -rn "yt-dlp\|youtube-dl-exec\|YT_COOKIES_FILE\|
   update-ytdlp"` over `bots/ shared/ docs/ package.json` and confirm only
   intentional prose references remain (e.g. history in `corpus/log.md`).
4. Update the wiki — [music.md](../../wiki/music.md) is the big one: its Stack
   list, the "Audio quality" format-selection bullet, the whole
   "VPS / datacenter IPs need cookies" section, and the Maintenance section all
   describe machinery that no longer exists. Rewrite them as history or delete
   them; the page must describe the code as it will then be. Also
   `status.md`.
5. Update [reenable-music.md](../../todos/reenable-music.md): the yt-dlp-through-a-
   proxy and yt-dlp-cookies revival routes in "Next steps" are no longer
   one-flag changes — say what re-adding them now costs. Also the "Automating
   yt-dlp freshness" question it absorbed is now moot; mark it so.
6. Append a `log.md` entry. Regenerate the catalog if any summary changed.

## Acceptance

- `npm run typecheck` clean.
- `bash corpus/lint.sh` clean.
- `youtube-dl-exec` gone from `bots/discord/package.json` and the lockfile;
  `discord-player-youtubei` still present.
- `YT_COOKIE` still in `env.ts`; `YT_COOKIES_FILE` gone.
- The `player.ts` comment explicitly warns that flipping `YOUTUBE_ENABLED` is no
  longer sufficient.
- The music commands are still commented out — unchanged by this brief.
