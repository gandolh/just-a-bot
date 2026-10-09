import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  JukeboxForbidden,
  JukeboxNotConfigured,
  JukeboxRequestError,
  JukeboxSignInFailed,
  JukeboxUnavailable,
} from './atrium/errors.ts';
import {
  choiceLabel,
  elapsedSeconds,
  errorReply,
  matchTracks,
  nowPlayingText,
  queueText,
  resolveTrack,
  trackChoices,
  type PlayerView,
} from './format.ts';
import type { Track } from './types.ts';

const track = (id: string, title: string, artist: string | null = null, album: string | null = null): Track => ({
  id,
  title,
  artist,
  album,
  trackNumber: null,
  durationSeconds: 200,
});

const PLAYLIST = [
  track('1', 'Slow River', 'Ana Marin', 'Low Water'),
  track('2', 'Harbour Lights', 'Ana Marin', 'Low Water'),
  track('3', 'Last Train Home', 'Odd Signals', 'Night Lines'),
  track('4', 'Untitled'),
];

test('autocomplete matches title, artist or album, case-insensitively, in Playlist order', () => {
  assert.deepEqual(matchTracks(PLAYLIST, 'ana').map((t) => t.id), ['1', '2']);
  assert.deepEqual(matchTracks(PLAYLIST, 'NIGHT').map((t) => t.id), ['3']);
  assert.deepEqual(matchTracks(PLAYLIST, '').map((t) => t.id), ['1', '2', '3', '4']);
});

test('autocomplete returns at most 25 choices, valued by Track id', () => {
  const many = Array.from({ length: 40 }, (_, i) => track(String(i), `Song ${i}`, 'Band'));
  const choices = trackChoices(many, 'song');
  assert.equal(choices.length, 25);
  assert.deepEqual(choices[0], { name: 'Song 0 · Band', value: '0' });
});

test('a choice label is "Title · Artist", the title alone without an artist, and never over 100 characters', () => {
  assert.equal(choiceLabel(PLAYLIST[0]), 'Slow River · Ana Marin');
  assert.equal(choiceLabel(PLAYLIST[3]), 'Untitled');
  const long = choiceLabel(track('x', 'A'.repeat(90), 'B'.repeat(30)));
  assert.equal(long.length, 100);
  assert.ok(long.endsWith('…'));
});

test('a typed value that is not an id resolves to its best match', () => {
  assert.equal(resolveTrack(PLAYLIST, '3')?.title, 'Last Train Home');
  assert.equal(resolveTrack(PLAYLIST, 'harbour')?.id, '2');
  assert.equal(resolveTrack(PLAYLIST, 'no such song'), null);
});

const player = (over: Partial<PlayerView> = {}): PlayerView => ({
  online: true,
  state: 'playing',
  voiceChannel: { id: '1', name: 'General' },
  track: PLAYLIST[0],
  positionMs: 61_000,
  positionAt: new Date(1_000_000).toISOString(),
  shuffle: false,
  repeat: 'off',
  queue: [],
  upcoming: [],
  ...over,
});

test('elapsed time moves on while playing and holds while paused', () => {
  assert.equal(elapsedSeconds(player(), 1_000_000 + 4_000), 65);
  assert.equal(elapsedSeconds(player({ state: 'paused' }), 1_000_000 + 4_000), 61);
  assert.equal(elapsedSeconds(player({ positionMs: 500_000 }), 1_000_000), 200, 'capped at the Track length');
});

test('now playing shows title, artist, album and elapsed over total', () => {
  assert.equal(nowPlayingText(player(), 1_000_000), '**Slow River** — Ana Marin · Low Water\n`1:01 / 3:20`');
  assert.equal(nowPlayingText(player({ state: 'paused' }), 1_000_000), '**Slow River** — Ana Marin · Low Water\n`1:01 / 3:20` (paused)');
  assert.equal(nowPlayingText(player({ state: 'idle', track: null }), 0), 'Nothing is playing.');
  assert.equal(nowPlayingText(player({ online: false }), 0), 'The player is offline.');
});

test('the queue lists ten entries with who added them, and counts the rest', () => {
  const queue = Array.from({ length: 13 }, (_, i) => ({
    id: i,
    track: track(String(i), `Song ${i}`, 'Band'),
    addedBy: { kind: 'discord' as const, name: i % 2 ? 'Dana' : 'Default' },
  }));
  const text = queueText(player({ queue }), 1_000_000);
  assert.match(text, /^Now: \*\*Slow River\*\*/);
  assert.match(text, /1\. \*\*Song 0\*\* — Band \(added by Default\)/);
  assert.match(text, /10\. \*\*Song 9\*\* — Band \(added by Dana\)/);
  assert.doesNotMatch(text, /Song 10\b/);
  assert.match(text, /…and 3 more$/);
  assert.match(queueText(player(), 0), /The queue is empty/);
});

test('each failure gets its reply', () => {
  assert.equal(errorReply(new JukeboxNotConfigured()), "The Jukebox isn't set up on this bot.");
  const signIn = "The Jukebox can't sign in to atrium. The owner has to check its account.";
  assert.equal(errorReply(new JukeboxSignInFailed('x')), signIn);
  assert.equal(errorReply(new JukeboxForbidden('JUKEBOX_ROLE_FORBIDDEN')), signIn);
  assert.equal(errorReply(new JukeboxUnavailable('x')), 'Atrium is unreachable right now.');
  assert.equal(errorReply(new JukeboxRequestError(409, 'PLAYER_OFFLINE')), 'The player is offline.');
  assert.equal(errorReply(new JukeboxRequestError(400, 'NOT_A_TRACK')), "That isn't a song in the library. Pick one from the list.");
});
