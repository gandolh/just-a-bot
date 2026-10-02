import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reminderMessage } from './tick.ts';

test('a reminder that would overflow a Discord message is truncated, not dropped (brief 15)', () => {
  const message = reminderMessage('123456789012345678', 'x'.repeat(1990));
  assert.equal(message.length, 2000);
  assert.ok(message.startsWith('<@123456789012345678> reminder: '));
  assert.ok(message.endsWith('…'));
});

test('a short reminder is sent as written', () => {
  assert.equal(reminderMessage('1', 'stretch'), '<@1> reminder: stretch');
});
