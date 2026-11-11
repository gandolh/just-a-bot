import { test } from "node:test";
import assert from "node:assert/strict";
import { rmdir } from "node:fs/promises";
import { BUFFER_ROOT, planBuffer, RETRY_FAILED_AFTER_MS, TrackBuffer } from "./buffer.ts";

test("cold start: the current Track plays live, the next two are fetched", () => {
  assert.deepEqual(planBuffer({ current: "a", upcoming: ["b", "c", "d"], ready: [], fetching: [] }), {
    keep: [],
    fetch: ["b", "c"],
    cancel: [],
    delete: [],
    forget: [],
  });
});

test("moving on keeps what is still wanted and deletes what played", () => {
  assert.deepEqual(planBuffer({ current: "b", upcoming: ["c", "d"], ready: ["a", "b", "c"], fetching: [] }), {
    keep: ["b", "c"],
    fetch: ["d"],
    cancel: [],
    delete: ["a"],
    forget: [],
  });
});

test("a Queue change cancels a download that left upcoming", () => {
  assert.deepEqual(planBuffer({ current: "a", upcoming: ["x", "b"], ready: ["a"], fetching: ["b", "c"] }), {
    keep: ["a"],
    fetch: ["x"],
    cancel: ["c"],
    delete: [],
    forget: [],
  });
});

test("never more than three files, even when upcoming repeats the current Track", () => {
  const plan = planBuffer({ current: "a", upcoming: ["a", "b", "b", "c", "d"], ready: ["a"], fetching: [] });
  assert.deepEqual(plan.fetch, ["b", "c"]);
  assert.ok(plan.keep.length + plan.fetch.length <= 3);
});

test("stopped: nothing current, the next two stay ready", () => {
  assert.deepEqual(planBuffer({ current: null, upcoming: ["b", "c"], ready: ["a", "b"], fetching: ["c"] }), {
    keep: ["b"],
    fetch: [],
    cancel: [],
    delete: ["a"],
    forget: [],
  });
});

test("a Track that failed to buffer is not fetched while it stays next, and is forgotten once it leaves", () => {
  const stays = planBuffer({ current: "a", upcoming: ["b", "c"], ready: [], fetching: [], failed: ["b"] });
  assert.deepEqual(stays.fetch, ["c"]);
  assert.deepEqual(stays.forget, []);
  const left = planBuffer({ current: "b", upcoming: ["c", "d"], ready: [], fetching: [], failed: ["b"] });
  assert.deepEqual(left.forget, ["b"], "it plays now, from the live pipe");
});

/** Wait until the buffer has no download in flight. */
async function drained(buffer: TrackBuffer): Promise<void> {
  for (let i = 0; i < 500 && buffer.size > 0; i++) await new Promise((resolve) => setTimeout(resolve, 2));
  assert.equal(buffer.size, 0, "the failed download finished");
}

test("a prefetch that fails is tried once across updates with the same upcoming list", async () => {
  let clock = 0;
  const attempts: string[] = [];
  const buffer = new TrackBuffer(
    `test-${process.pid}`,
    async (trackId) => {
      attempts.push(trackId);
      throw new Error("atrium answered 500");
    },
    () => clock,
  );
  try {
    for (let i = 0; i < 3; i++) {
      buffer.update("a", ["b"]);
      await drained(buffer);
    }
    assert.deepEqual(attempts, ["b"]);

    clock += RETRY_FAILED_AFTER_MS;
    buffer.update("a", ["b"]);
    await drained(buffer);
    assert.deepEqual(attempts, ["b", "b"], "tried again after a while");

    buffer.update("b", ["c"]);
    await drained(buffer);
    buffer.update("c", ["b"]);
    await drained(buffer);
    assert.deepEqual(attempts, ["b", "b", "c", "b"], "and when it comes back after leaving");
  } finally {
    await buffer.clear();
    await rmdir(BUFFER_ROOT).catch(() => {}); // Only if empty.
  }
});
