import { test } from "node:test";
import assert from "node:assert/strict";
import { answerThroughWicket, queueLine } from "./answer.ts";
import { WicketError, type WicketClient, type WicketJob } from "../wicket/client.ts";

const base: WicketJob = { id: "j1", ticket: 14, nowServing: 11, position: 3, status: "queued" };

/** A Wicket that hands out `states` in order: the first from submit, the rest from get. */
function stubWicket(states: (WicketJob | undefined | Error)[]) {
  const log: string[] = [];
  const next = () => {
    const state = states.shift();
    if (state instanceof Error) throw state;
    return state;
  };
  const client: WicketClient = {
    submit: async () => {
      log.push("submit");
      return next() as WicketJob;
    },
    get: async (id, wait) => {
      log.push(`get ${id} wait=${wait}`);
      return next();
    },
    cancel: async (id) => void log.push(`cancel ${id}`),
  };
  return { client, log };
}

/** A deferred interaction, recording its calls in order. */
function interaction() {
  const calls: string[] = [];
  return {
    calls,
    editReply: async (content: string) => void calls.push(`edit: ${content}`),
    followUp: async (options: string | { content: string; ephemeral: true }) =>
      void calls.push(typeof options === "string" ? `followUp: ${options}` : `private: ${options.content}`),
    deleteReply: async () => void calls.push("delete"),
  };
}

const run = (states: (WicketJob | undefined | Error)[], at = () => 0, deadline = 60_000) => {
  const wicket = stubWicket(states);
  const reply = interaction();
  const done = answerThroughWicket({ interaction: reply, client: wicket.client, prompt: "Why?", deadline, now: at });
  return { done, wicket, reply };
};

test("the ticket line, waiting", () => {
  assert.equal(queueLine(base), "You're number 14 · now serving 11");
  assert.equal(queueLine({ ...base, status: "running" }), "Thinking…");
});

test("queued → running → done edits the reply in that order, once per change", async () => {
  const { done, reply, wicket } = run([
    base,
    { ...base, position: 2 }, // same line: no edit
    { ...base, nowServing: 13, position: 1 },
    { ...base, nowServing: 14, position: 0, status: "running" },
    { ...base, nowServing: 14, position: 0, status: "done", result: { text: "Because.", model: "gpt-oss:120b" } },
  ]);
  assert.deepEqual(await done, { outcome: "answered", model: "gpt-oss:120b" });
  assert.deepEqual(reply.calls, [
    "edit: You're number 14 · now serving 11",
    "edit: You're number 14 · now serving 13",
    "edit: Thinking…",
    "edit: > Why?\n\nBecause.",
  ]);
  assert.equal(wicket.log.filter((l) => l === "get j1 wait=25").length, 4);
});

test("a long answer still goes out as the edit plus follow-ups", async () => {
  const text = Array.from({ length: 600 }, (_, i) => `word${i}`).join(" ");
  const { done, reply } = run([{ ...base, status: "done", result: { text, model: "m" } }]);
  await done;
  assert.equal(reply.calls.length, 3);
  assert.ok(reply.calls[0].startsWith("edit: > Why?"));
  assert.ok(reply.calls[1].startsWith("followUp: "));
});

test("a failed job answers privately with Wicket’s reason", async () => {
  const { done, reply } = run([base, { ...base, status: "failed", error: "the cloud model answered 429" }]);
  assert.equal((await done).outcome, "failed");
  assert.deepEqual(reply.calls, [
    "edit: You're number 14 · now serving 11",
    "delete",
    "private: ⚠️ The model failed: the cloud model answered 429.",
  ]);
});

test("a cancelled job (the queue was cleared) answers privately", async () => {
  const { done, reply } = run([base, { ...base, status: "cancelled", error: "cleared" }]);
  assert.equal((await done).outcome, "cancelled");
  assert.deepEqual(reply.calls.slice(1), ["delete", "private: ⚠️ Your question was cancelled: cleared."]);
});

test("a job Wicket forgot (a restart) answers privately", async () => {
  const { done, reply } = run([base, undefined]);
  assert.equal((await done).outcome, "lost");
  assert.deepEqual(reply.calls.slice(1), [
    "delete",
    "private: ⚠️ Wicket lost your question (it restarted). Ask again.",
  ]);
});

test("a refused submit (the queue is full) answers privately and never waits", async () => {
  const { done, reply, wicket } = run([new WicketError("The queue is full right now. Try again in a few minutes.")]);
  assert.equal((await done).outcome, "failed");
  assert.deepEqual(wicket.log, ["submit"]);
  assert.deepEqual(reply.calls, ["delete", "private: ⚠️ The queue is full right now. Try again in a few minutes."]);
});

test("an expiring interaction cancels its job, then tells the member", async () => {
  let clock = 0;
  const { done, reply, wicket } = run(
    [base, { ...base, nowServing: 12 }, { ...base, nowServing: 12 }],
    () => clock,
    40_000,
  );
  // Each long-poll takes its full wait on this clock.
  const get = wicket.client.get;
  wicket.client.get = async (id, wait) => {
    clock += wait * 1000;
    return get(id, wait);
  };
  assert.equal((await done).outcome, "expired");
  assert.deepEqual(wicket.log, ["submit", "get j1 wait=25", "get j1 wait=15", "cancel j1"]);
  assert.deepEqual(reply.calls.slice(-2), [
    "delete",
    "private: ⚠️ Your question waited too long in the queue, so it was withdrawn. Ask again later.",
  ]);
});

test("Wicket going away mid-wait withdraws the job and answers privately", async () => {
  const { done, reply, wicket } = run([base, new WicketError("Could not reach Wicket.")]);
  assert.equal((await done).outcome, "failed");
  assert.ok(wicket.log.includes("cancel j1"));
  assert.deepEqual(reply.calls.slice(1), ["delete", "private: ⚠️ Could not reach Wicket."]);
});
