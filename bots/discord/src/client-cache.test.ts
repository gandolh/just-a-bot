import { test } from "node:test";
import assert from "node:assert/strict";
import { clientCacheOptions, keepMember, keepUser, messageIsStale, MESSAGES_PER_CHANNEL } from "./client-cache.ts";

const BOT = "bot-1";

function fakeClient(voiceUserIds: string[]) {
  const states = [{ voiceStates: { cache: new Set(voiceUserIds) } }];
  return {
    user: { id: BOT },
    guilds: { cache: { some: (fn: (g: (typeof states)[number]) => boolean) => states.some(fn) } },
  } as never as Parameters<typeof keepUser>[0]["client"];
}

test("the message cache holds 25 per channel", () => {
  assert.equal(MESSAGES_PER_CHANNEL, 25);
  assert.equal(typeof clientCacheOptions.makeCache, "function");
});

test("messages older than 30 minutes are stale, an edit renews them", () => {
  const now = 10_000_000;
  assert.equal(messageIsStale({ editedTimestamp: null, createdTimestamp: now - 31 * 60_000 }, now), true);
  assert.equal(messageIsStale({ editedTimestamp: null, createdTimestamp: now - 29 * 60_000 }, now), false);
  assert.equal(messageIsStale({ editedTimestamp: now - 60_000, createdTimestamp: now - 90 * 60_000 }, now), false);
});

test("the member sweep keeps the bot and anyone in voice, and drops the rest", () => {
  const client = fakeClient([]);
  assert.equal(keepMember({ id: BOT, voice: { channelId: null }, client } as never), true);
  assert.equal(keepMember({ id: "u1", voice: { channelId: "v1" }, client } as never), true);
  assert.equal(keepMember({ id: "u2", voice: { channelId: null }, client } as never), false);
});

test("the user sweep keeps the bot and anyone with a voice state, and drops the rest", () => {
  const client = fakeClient(["u1"]);
  assert.equal(keepUser({ id: BOT, client }), true);
  assert.equal(keepUser({ id: "u1", client }), true);
  assert.equal(keepUser({ id: "u2", client }), false);
});

test("the sweepers run hourly and keep discord.js's thread sweep", () => {
  const s = clientCacheOptions.sweepers!;
  assert.equal(s.messages?.interval, 3600);
  assert.equal(s.guildMembers?.interval, 3600);
  assert.equal(s.users?.interval, 3600);
  assert.ok(s.threads);
});
