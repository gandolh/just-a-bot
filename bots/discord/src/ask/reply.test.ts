import { test } from "node:test";
import assert from "node:assert/strict";
import { answerMessages, CUT_NOTE, DISCORD_MESSAGE_LIMIT, failPrivately, MAX_ANSWER_MESSAGES } from "./reply.ts";

test("a short answer is one message with the prompt quoted", () => {
  assert.deepEqual(answerMessages("What is 2+2?", "4."), ["> What is 2+2?\n\n4."]);
});

test("a long answer takes at most three messages, and the last says it was cut", () => {
  const answer = Array.from({ length: 2_000 }, (_, i) => `word${i}`).join(" ");
  const messages = answerMessages("Write a lot.", answer);
  assert.equal(messages.length, MAX_ANSWER_MESSAGES);
  for (const message of messages) assert.ok(message.length <= DISCORD_MESSAGE_LIMIT, `${message.length} characters`);
  assert.ok(messages.at(-1)!.endsWith(CUT_NOTE));
});

test("an answer that fits in three messages is not cut", () => {
  const answer = "x ".repeat(2_500).trim();
  const messages = answerMessages("Hi", answer);
  assert.equal(messages.length, 3);
  assert.ok(!messages.at(-1)!.endsWith(CUT_NOTE));
});

/** A failed question's interaction, recording its calls in order. */
function failedAsk(deleteFails = false) {
  const calls: string[] = [];
  const interaction = {
    deleteReply: async () => {
      calls.push("deleteReply");
      if (deleteFails) throw new Error("Unknown Message");
    },
    followUp: async (options: { content: string; ephemeral: true }) => {
      calls.push(`followUp${options.ephemeral ? " ephemeral" : ""}: ${options.content}`);
    },
  };
  return { calls, interaction };
}

test("a failure deletes the public placeholder, then tells only the member", async () => {
  const { calls, interaction } = failedAsk();
  await failPrivately(interaction, "⚠️ Ollama returned 429: quota used up");
  assert.deepEqual(calls, ["deleteReply", "followUp ephemeral: ⚠️ Ollama returned 429: quota used up"]);
});

test("a failed delete is reported, and the member is still told", async () => {
  const { calls, interaction } = failedAsk(true);
  const reported: unknown[] = [];
  await failPrivately(interaction, "⚠️ Model took longer than 60s to respond.", (err) => reported.push(err));
  assert.deepEqual(calls, ["deleteReply", "followUp ephemeral: ⚠️ Model took longer than 60s to respond."]);
  assert.equal(reported.length, 1);
});
