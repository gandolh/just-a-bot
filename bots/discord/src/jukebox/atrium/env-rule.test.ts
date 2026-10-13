import { test } from 'node:test';
import assert from 'node:assert/strict';
import { missingJukeboxVars, staleJukeboxVars } from './env-rule.ts';

const ALL = {
  JUKEBOX_ATRIUM_URL: 'https://example.test/atrium-api',
  JUKEBOX_ATRIUM_USERNAME: 'discord-bot',
  JUKEBOX_ATRIUM_PASSWORD: 'not-a-real-password',
};

test('none set is fine: the Jukebox is simply off', () => {
  assert.deepEqual(missingJukeboxVars({}), []);
});

test('all three set is fine', () => {
  assert.deepEqual(missingJukeboxVars(ALL), []);
});

test('a partial set names exactly the missing ones', () => {
  assert.deepEqual(missingJukeboxVars({ ...ALL, JUKEBOX_ATRIUM_PASSWORD: undefined }), ['JUKEBOX_ATRIUM_PASSWORD']);
  assert.deepEqual(missingJukeboxVars({ JUKEBOX_ATRIUM_URL: ALL.JUKEBOX_ATRIUM_URL }), [
    'JUKEBOX_ATRIUM_USERNAME',
    'JUKEBOX_ATRIUM_PASSWORD',
  ]);
});

test('an empty value counts as unset', () => {
  assert.deepEqual(missingJukeboxVars({ ...ALL, JUKEBOX_ATRIUM_USERNAME: '' }), ['JUKEBOX_ATRIUM_USERNAME']);
});

test("Ward's old variable names are not part of the rule, and are reported when still set", () => {
  assert.deepEqual(missingJukeboxVars({ ...ALL, JUKEBOX_WARD_URL: 'https://example.test/ward-api' } as never), []);
  assert.deepEqual(staleJukeboxVars({ ...ALL }), []);
  assert.deepEqual(staleJukeboxVars({ JUKEBOX_WARD_URL: 'x', JUKEBOX_WARD_USERNAME: '', JUKEBOX_WARD_PASSWORD: 'y' }), [
    'JUKEBOX_WARD_URL',
    'JUKEBOX_WARD_PASSWORD',
  ]);
});
