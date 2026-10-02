import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAbsolute, parseDuration, parseWhen } from './parse.ts';

const deltaMs = (d: Date | null) => {
  assert.ok(d, 'expected a date');
  return d.getTime() - Date.now();
};
const near = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 1_000, `${actual} not within 1 s of ${expected}`);

test('parseDuration understands every unit, singular and plural', () => {
  near(deltaMs(parseDuration('30m')), 30 * 60_000);
  near(deltaMs(parseDuration('5 min')), 5 * 60_000);
  near(deltaMs(parseDuration('2h')), 2 * 3_600_000);
  near(deltaMs(parseDuration('3 hrs')), 3 * 3_600_000);
  near(deltaMs(parseDuration('1d')), 86_400_000);
  near(deltaMs(parseDuration('2 days')), 2 * 86_400_000);
  assert.equal(parseDuration('soon'), null);
  assert.equal(parseDuration('5w'), null);
});

test('"tomorrow 12am" is midnight UTC and "tomorrow 12pm" is noon UTC', () => {
  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const am = parseAbsolute('tomorrow 12am')!;
  const pm = parseAbsolute('tomorrow 12pm')!;
  assert.equal(am.getUTCHours(), 0);
  assert.equal(pm.getUTCHours(), 12);
  assert.equal(am.getUTCDate(), tomorrow.getUTCDate());
  assert.equal(parseAbsolute('tomorrow 9:30pm')!.getUTCHours(), 21);
  assert.equal(parseAbsolute('tomorrow')!.getUTCHours(), 9);
});

test('the ISO form is read as UTC, with and without a time', () => {
  assert.equal(parseAbsolute('2026-06-01 15:00')!.toISOString(), '2026-06-01T15:00:00.000Z');
  assert.equal(parseAbsolute('2026-06-01')!.toISOString(), '2026-06-01T00:00:00.000Z');
  assert.equal(parseAbsolute('June 1st'), null);
});

test('dates that are not on the calendar are rejected, not rolled forward (brief 24)', () => {
  assert.equal(parseWhen('2026-02-30'), null);
  assert.equal(parseWhen('2026-04-31 10:00'), null);
  assert.equal(parseWhen('2026-13-01'), null);
  assert.equal(parseWhen('2028-02-29')!.toISOString(), '2028-02-29T00:00:00.000Z');
  assert.equal(parseWhen('2026-12-31 23:59')!.toISOString(), '2026-12-31T23:59:00.000Z');
  assert.equal(parseWhen('2026-02-29'), null); // not a leap year
});

test('parseWhen tries a duration first, then an absolute date', () => {
  near(deltaMs(parseWhen('2h')), 2 * 3_600_000);
  assert.equal(parseWhen('2026-06-01')!.toISOString(), '2026-06-01T00:00:00.000Z');
});
