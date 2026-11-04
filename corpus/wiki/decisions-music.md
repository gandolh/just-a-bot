---
summary: The bot's music calls — music was removed and would start from zero, then the Jukebox came back playing from atrium, signed in as the bot's own atrium user. Split out of decisions.md on 2026-11-04.
updated: 2026-11-04
---

# Decisions: music

Moved from [decisions.md](decisions.md) on 2026-11-04, unchanged.

## No music; a future music feature starts from zero

_2026-10-07_ — The bot has no music. The old approach, playback through
third-party sources (YouTube, yt-dlp, SoundCloud) with their extractors, is
dropped for good, findings included. Its code and dependencies went on
2026-08-27; its post-mortem, research todo and superseded provider decisions
went on 2026-10-07. The owner plans a different design: in-house, with
on-demand loading or downloaded files, built from zero. The owner files the
brief when it is time.
Rejected: keeping the post-mortem and the untried SoundCloud test as the
starting point for a rebuild. The new design shares nothing with them.

## Music comes from atrium, signed in as the bot's own atrium user

_2026-10-08_, grilled with the owner; sign-in revised 2026-10-13. This is the in-house design the entry above was waiting for. The bot
plays only Tracks from atrium's music library, and it has no other music source.
It reaches atrium as its own local user, logging in with a password from `.env`
the way a person does (`POST /auth/login`). That user has the role
`jukebox`, which atrium enforces as an allowlist of routes (atrium D55): list
music, stream a Track, the bot-facing Jukebox endpoints, nothing else. Any guild
member may control playback, from Discord or atrium's Jukebox page.
The bot keeps **no Player state of its own**. Atrium holds each Player, its
Queue and its position (atrium D57). The bot holds one long-poll request open to
atrium for commands, reports its status back, and still binds no port. Slash
commands call atrium too, so a Player has one writer. This is the one feature
whose state is not JSON on the bot's disk; its temp-directory buffers are
disposable copies of atrium's Tracks.
The session is the `atrium_session` cookie, **held in memory only**; a 401 means
one new login, a refused password is tried once until a restart.
Rejected: audio files on the bot's own disk (a second library to keep in step);
a key only atrium and the bot share (atrium would authenticate a stranger); a
profile in the owner's account (it hands the bot the owner's session); a Ward
account (atrium dropped Ward's cookie on 2026-10-13, its D58); a cookie on disk.
Reason: atrium already has the library, the covers, the metadata, the upload
page and HTTP range streaming. The bot only has to play. A separate user is the
one way to make "the bot can only use its own profile" a rule, because atrium
profiles switch without a password. The old `jukebox-session.json` was there
because Ward's refresh token rotates; atrium's cookie does not, and a restart
costs one login, so a file would only add a secret on disk.
