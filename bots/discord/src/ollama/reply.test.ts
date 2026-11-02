import { test } from 'node:test';
import assert from 'node:assert/strict';
import { answerMessages, CUT_NOTE, DISCORD_MESSAGE_LIMIT, MAX_ANSWER_MESSAGES } from './reply.ts';

test('a short answer is one message with the prompt quoted', () => {
  assert.deepEqual(answerMessages('What is 2+2?', '4.'), ['> What is 2+2?\n\n4.']);
});

test('a long answer takes at most three messages, and the last says it was cut', () => {
  const answer = Array.from({ length: 2_000 }, (_, i) => `word${i}`).join(' ');
  const messages = answerMessages('Write a lot.', answer);
  assert.equal(messages.length, MAX_ANSWER_MESSAGES);
  for (const message of messages) assert.ok(message.length <= DISCORD_MESSAGE_LIMIT, `${message.length} characters`);
  assert.ok(messages.at(-1)!.endsWith(CUT_NOTE));
});

test('an answer that fits in three messages is not cut', () => {
  const answer = 'x '.repeat(2_500).trim();
  const messages = answerMessages('Hi', answer);
  assert.equal(messages.length, 3);
  assert.ok(!messages.at(-1)!.endsWith(CUT_NOTE));
});
