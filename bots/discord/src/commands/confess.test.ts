import { test } from "node:test";
import assert from "node:assert/strict";
import type { ChatInputCommandInteraction } from "discord.js";
import type { ConfessionEntry, ConfessionStore } from "../confessions/store.ts";
import { submitConfession, type ConfessionStoreApi } from "./confess.ts";

/** A store that takes a moment on every call, like the fsynced file it stands in for. */
function slowStore(channelId: string | null): ConfessionStoreApi & { added: number } {
  const later = <T>(value: T) => new Promise<T>((resolve) => setTimeout(() => resolve(value), 5));
  const api = {
    added: 0,
    loadStore: () => later<ConfessionStore>({ channelId, nextId: 1, confessions: [] }),
    addConfession: (_guildId: string, text: string) => {
      api.added += 1;
      return later<ConfessionEntry>({ id: api.added, text, postedAt: new Date(0).toISOString() });
    },
  };
  return api;
}

let nextUser = 1;

/** A `/confess submit` from one member; `posts` counts what reached the channel. */
function submission(userId: string, posts: string[], replies: string[]) {
  const channel = {
    isTextBased: () => true,
    send: async () => void posts.push(userId),
  };
  return {
    guildId: "100000000000000001",
    user: { id: userId },
    options: { getString: () => "I ate the last biscuit." },
    client: { channels: { fetch: async () => channel } },
    reply: async ({ content }: { content: string }) => void replies.push(content),
  } as unknown as ChatInputCommandInteraction;
}

test("two submissions at once from one member: one posts, the other is told to wait", async () => {
  const user = String(nextUser++);
  const posts: string[] = [];
  const replies: string[] = [];
  const store = slowStore("200000000000000001");
  await Promise.all([
    submitConfession(submission(user, posts, replies), store),
    submitConfession(submission(user, posts, replies), store),
  ]);
  assert.equal(posts.length, 1);
  assert.equal(store.added, 1);
  assert.equal(replies.filter((r) => r.startsWith("Posted.")).length, 1);
  assert.equal(replies.filter((r) => r.startsWith("You're submitting too fast")).length, 1);
});

test("a submission that does not post gives the cooldown back", async () => {
  const user = String(nextUser++);
  const posts: string[] = [];
  const replies: string[] = [];
  await submitConfession(submission(user, posts, replies), slowStore(null));
  assert.match(replies[0], /set-channel/);
  await submitConfession(submission(user, posts, replies), slowStore("200000000000000001"));
  assert.equal(posts.length, 1, "the refusal did not start a cooldown");
});
