import { test } from 'node:test';
import assert from 'node:assert/strict';
import { missingJukeboxVars } from './env-rule.ts';

const ALL = {
  JUKEBOX_ATRIUM_URL: 'https://example.test/atrium-api',
  JUKEBOX_WARD_URL: 'https://example.test/ward-api',
  JUKEBOX_WARD_USERNAME: 'discord-bot',
  JUKEBOX_WARD_PASSWORD: 'not-a-real-password',
};

test('none set is fine: the Jukebox is simply off', () => {
  assert.deepEqual(missingJukeboxVars({}), []);
});

test('all four set is fine', () => {
  assert.deepEqual(missingJukeboxVars(ALL), []);
});

test('a partial set names exactly the missing ones', () => {
  assert.deepEqual(missingJukeboxVars({ ...ALL, JUKEBOX_WARD_PASSWORD: undefined }), ['JUKEBOX_WARD_PASSWORD']);
  assert.deepEqual(missingJukeboxVars({ JUKEBOX_ATRIUM_URL: ALL.JUKEBOX_ATRIUM_URL }), [
    'JUKEBOX_WARD_URL',
    'JUKEBOX_WARD_USERNAME',
    'JUKEBOX_WARD_PASSWORD',
  ]);
});

test('an empty value counts as unset', () => {
  assert.deepEqual(missingJukeboxVars({ ...ALL, JUKEBOX_WARD_USERNAME: '' }), ['JUKEBOX_WARD_USERNAME']);
});
