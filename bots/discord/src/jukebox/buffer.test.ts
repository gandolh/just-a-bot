import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planBuffer } from './buffer.ts';

test('cold start: the current Track plays live, the next two are fetched', () => {
  assert.deepEqual(planBuffer({ current: 'a', upcoming: ['b', 'c', 'd'], ready: [], fetching: [] }), {
    keep: [],
    fetch: ['b', 'c'],
    cancel: [],
    delete: [],
  });
});

test('moving on keeps what is still wanted and deletes what played', () => {
  assert.deepEqual(planBuffer({ current: 'b', upcoming: ['c', 'd'], ready: ['a', 'b', 'c'], fetching: [] }), {
    keep: ['b', 'c'],
    fetch: ['d'],
    cancel: [],
    delete: ['a'],
  });
});

test('a Queue change cancels a download that left upcoming', () => {
  assert.deepEqual(planBuffer({ current: 'a', upcoming: ['x', 'b'], ready: ['a'], fetching: ['b', 'c'] }), {
    keep: ['a'],
    fetch: ['x'],
    cancel: ['c'],
    delete: [],
  });
});

test('never more than three files, even when upcoming repeats the current Track', () => {
  const plan = planBuffer({ current: 'a', upcoming: ['a', 'b', 'b', 'c', 'd'], ready: ['a'], fetching: [] });
  assert.deepEqual(plan.fetch, ['b', 'c']);
  assert.ok(plan.keep.length + plan.fetch.length <= 3);
});

test('stopped: nothing current, the next two stay ready', () => {
  assert.deepEqual(planBuffer({ current: null, upcoming: ['b', 'c'], ready: ['a', 'b'], fetching: ['c'] }), {
    keep: ['b'],
    fetch: [],
    cancel: [],
    delete: ['a'],
  });
});
