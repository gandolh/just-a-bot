import { test } from "node:test";
import assert from "node:assert/strict";

// The command imports the bot's env, which is validated at import time.
// Dummy values are enough: nothing here talks to Discord or atrium.
process.env.DISCORD_TOKEN ??= "test-token";
process.env.CLIENT_ID ??= "1";
process.env.GUILD_ID ??= "1";
const { answer } = await import("./jukebox.ts");
type Answerable = import("./jukebox.ts").Answerable;

/** An interaction that records the calls `answer` makes, in order. */
function recorder() {
  const calls: string[] = [];
  const record = (name: string) => async (options?: { content?: string; ephemeral?: boolean }) => {
    const flags = options?.ephemeral ? " ephemeral" : "";
    calls.push(options?.content ? `${name}${flags}: ${options.content}` : `${name}${flags}`);
    return undefined as never;
  };
  const interaction = {
    reply: record("reply"),
    deferReply: record("deferReply"),
    editReply: record("editReply"),
    followUp: record("followUp"),
    deleteReply: record("deleteReply"),
  } as unknown as Answerable;
  return { calls, interaction };
}

const slowly =
  <T>(value: T) =>
  () =>
    new Promise<T>((resolve) => setTimeout(() => resolve(value), 30));

test("a fast answer is one reply, public or ephemeral", async () => {
  const { calls, interaction } = recorder();
  await answer(interaction, async () => ({ content: "Skipped.", public: true }), 1_000);
  assert.deepEqual(calls, ["reply: Skipped."]);
});

test("a slow public answer fills the placeholder before it follows up, then removes the placeholder", async () => {
  const { calls, interaction } = recorder();
  await answer(interaction, slowly({ content: "Skipped.", public: true }), 5);
  assert.deepEqual(calls, ["deferReply ephemeral", "editReply: Skipped.", "followUp: Skipped.", "deleteReply"]);
});

test("a slow error stays in the ephemeral placeholder", async () => {
  const { calls, interaction } = recorder();
  await answer(interaction, slowly({ content: "Atrium is unreachable right now.", public: false }), 5);
  assert.deepEqual(calls, ["deferReply ephemeral", "editReply: Atrium is unreachable right now."]);
});
