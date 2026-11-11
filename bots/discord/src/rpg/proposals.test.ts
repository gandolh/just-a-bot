import { test } from "node:test";
import assert from "node:assert/strict";
import { runDuel, startDuel } from "./duel.ts";
import { claimProposalSlot, PROPOSAL_COOLDOWN_MS, proposalConflict } from "./proposals.ts";
import { startTrade } from "./trade.ts";
import { pruneDuelsAndTrades, SOCIAL_RECORD_TTL_MS, type Character, type Duel, type World } from "./world.ts";

const char = (userId: string) =>
  ({
    userId,
    name: userId,
    glyph: "🧙",
    hp: 20,
    maxHp: 20,
    atk: 3,
    def: 1,
    xp: 0,
    level: 1,
    inventory: [],
    equipment: { weapon: null, armor: null },
  }) as unknown as Character;
const world = () =>
  ({ chars: { A: char("A"), B: char("B"), C: char("C") }, duels: {}, trades: {}, nextId: 1 }) as unknown as World;

test("a second duel for a pair with one pending is refused, either way round", () => {
  const w = world();
  assert.equal(proposalConflict(w, "duel", "A", "B"), null);
  startDuel(w, "A", "B", "msg", "chan");
  assert.match(proposalConflict(w, "duel", "A", "B") ?? "", /already waiting/);
  assert.match(proposalConflict(w, "duel", "B", "A") ?? "", /already waiting/);
  assert.equal(proposalConflict(w, "duel", "A", "C"), null, "another pair is free");
  assert.equal(proposalConflict(w, "trade", "A", "B"), null, "a trade is a different proposal");
});

test("an expired duel no longer blocks the pair", () => {
  const w = world();
  const duel = startDuel(w, "A", "B", "msg", "chan");
  duel.expiresAt = new Date(Date.now() - 1).toISOString();
  assert.equal(proposalConflict(w, "duel", "A", "B"), null);
});

test("a second trade for a pair with one open is refused", () => {
  const w = world();
  startTrade(w, "A", "B", "msg", "chan");
  assert.match(proposalConflict(w, "trade", "B", "A") ?? "", /already have a trade open/);
});

test("a member waits between proposals; a refused one gives the slot back", () => {
  const key = `guild:${process.pid}:member`;
  const first = claimProposalSlot(key, 1_000);
  assert.equal(first.ok, true);
  const second = claimProposalSlot(key, 2_000);
  assert.deepEqual(second, { ok: false, waitSeconds: 14 });
  assert.equal(claimProposalSlot(key, 1_000 + PROPOSAL_COOLDOWN_MS).ok, true, "free again after the cooldown");

  const other = `guild:${process.pid}:other`;
  const refused = claimProposalSlot(other, 5_000);
  assert.ok(refused.ok);
  refused.release();
  assert.equal(claimProposalSlot(other, 5_001).ok, true);
});

test("a world with 1,000 finished duels keeps none of them", () => {
  const w = world();
  const now = Date.now();
  for (let i = 0; i < 1_000; i++) {
    w.duels[`duel-${i}`] = {
      id: `duel-${i}`,
      challengerId: "A",
      defenderId: "B",
      state: "finished",
      createdAt: new Date(now - 60_000).toISOString(),
      expiresAt: new Date(now).toISOString(),
      messageId: "m",
      channelId: "c",
      log: Array.from({ length: 30 }, () => "a swing"),
    } satisfies Duel;
  }
  pruneDuelsAndTrades(w, now);
  assert.deepEqual(Object.keys(w.duels), []);
});

test("closed trades go, open ones stay a day, and an expired duel stays a day for its late presses", () => {
  const w = world();
  const now = Date.now();
  const open = startTrade(w, "A", "B", "m", "c");
  const done = startTrade(w, "A", "C", "m", "c");
  done.state = "completed";
  const legacy = startTrade(w, "B", "C", "m", "c");
  delete legacy.createdAt; // Saved before trades had one.
  const expired = startDuel(w, "A", "B", "m", "c");
  expired.expiresAt = new Date(now - 1).toISOString();

  pruneDuelsAndTrades(w, now);
  assert.deepEqual(Object.keys(w.trades).sort(), [open.id, legacy.id].sort());
  assert.ok(w.duels[expired.id]);

  pruneDuelsAndTrades(w, now + SOCIAL_RECORD_TTL_MS + 1);
  assert.deepEqual(Object.keys(w.trades), []);
  assert.deepEqual(Object.keys(w.duels), []);
});

test("a resolved duel keeps no log in the world; the caller gets it", () => {
  const w = world();
  const duel = startDuel(w, "A", "B", "m", "c");
  duel.state = "active";
  const result = runDuel(w, duel.id);
  assert.ok(result && result.log.length > 0);
  assert.deepEqual(w.duels[duel.id].log, []);
  assert.equal(w.duels[duel.id].state, "finished");
});
