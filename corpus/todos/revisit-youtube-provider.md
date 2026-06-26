---
title: Re-enable the YouTube provider when the VPS IP block is solvable
created: 2026-06-26
status: open
tags: [music, youtube, yt-dlp, vps]
---

# Re-enable the YouTube provider when the VPS IP block is solvable

> **Superseded by [reenable-music.md](reenable-music.md)** (2026-06-26) — the whole
> music feature is now shelved/commented out, not just YouTube. This file remains
> as the YouTube-specific technical detail.

YouTube is currently the **disabled secondary** music provider. SoundCloud is the
temporary primary. Re-enable YouTube once we can stream from the VPS again.

## Context

YouTube blocks our Hetzner VPS datacenter IP with `Sign in to confirm you're not
a bot`, so yt-dlp streaming returns an empty stream and the bot joins voice
silently (metadata still resolves). Works fine from residential IPs. See
[music.md](../wiki/music.md) and the 2026-06-26 incident in [log.md](../log.md).

The YouTube code path is kept intact in
[player.ts](../../bots/discord/src/player.ts): `streamWithYtDlp` (marked
`@deprecated`) plus the `YoutubeExtractor` registration gated behind
`const YOUTUBE_ENABLED = false`. Flipping that flag re-enables it.

## What to check (periodically)

- Does `node_modules/youtube-dl-exec/bin/yt-dlp -f bestaudio -o - <url>` stream
  bytes **from the VPS** without the "not a bot" error? (run `yt-dlp -U` first)
- If still blocked, is there now a low-maintenance bypass that doesn't need
  manual cookie refresh? Candidates last reviewed 2026-06-26:
  - **PO token provider** (`bgutil-ytdlp-pot-provider` sidecar) — no cookies but
    extra infra.
  - **Forcing a player client** via `--extractor-args youtube:player_client=…`
    (android_vr/tv) — fragile, YouTube keeps closing these.
  - **Residential proxy** via `--proxy` — reliable but paid.
  - **Cookies** (`YT_COOKIES_FILE`, already wired) — works, expires ~2 weeks.

## Acceptance

- yt-dlp streams from the VPS reliably (some sustained way), AND
- `YOUTUBE_ENABLED` flipped to `true`, YouTube priority restored as desired,
  verified with a real `/play` on the VPS producing sound.
