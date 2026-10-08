import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AloneWatch, type Timers } from './alone.ts';

/** A clock that only moves when the test says so. */
function fakeClock() {
  let now = 0;
  let nextId = 1;
  const pending = new Map<number, { at: number; fn: () => void }>();
  const timers: Timers = {
    setTimeout: (fn, ms) => {
      const id = nextId++;
      pending.set(id, { at: now + ms, fn });
      return id;
    },
    clearTimeout: (id) => void pending.delete(id as number),
  };
  const advance = (ms: number) => {
    now += ms;
    for (const [id, t] of [...pending]) {
      if (t.at <= now) {
        pending.delete(id);
        t.fn();
      }
    }
  };
  return { timers, advance, pending };
}

function watch() {
  const clock = fakeClock();
  const calls: string[] = [];
  const alone = new AloneWatch({ pause: () => calls.push('pause'), leave: () => calls.push('leave') }, clock.timers, 600_000);
  return { alone, calls, clock };
}

test('everyone leaves: pause at once, leave ten minutes later', () => {
  const { alone, calls, clock } = watch();
  alone.update(2);
  alone.update(0);
  assert.deepEqual(calls, ['pause']);
  clock.advance(599_999);
  assert.deepEqual(calls, ['pause']);
  clock.advance(1);
  assert.deepEqual(calls, ['pause', 'leave']);
});

test('someone returns before the ten minutes: no leave, and no resume either', () => {
  const { alone, calls, clock } = watch();
  alone.update(0);
  clock.advance(300_000);
  alone.update(1);
  clock.advance(600_000);
  assert.deepEqual(calls, ['pause']);
});

test('more bot-only updates while alone do not pause again or restart the countdown', () => {
  const { alone, calls, clock } = watch();
  alone.update(0);
  clock.advance(400_000);
  alone.update(0);
  clock.advance(200_000);
  assert.deepEqual(calls, ['pause', 'leave']);
});

test('leaving voice (null) cancels the countdown', () => {
  const { alone, calls, clock } = watch();
  alone.update(0);
  alone.update(null);
  clock.advance(600_000);
  assert.deepEqual(calls, ['pause']);
  assert.equal(clock.pending.size, 0);
});
