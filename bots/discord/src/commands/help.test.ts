import { test } from 'node:test';
import assert from 'node:assert/strict';

// `commands/index.ts` pulls in `ask.ts`, which validates the bot's env at
// import time. Dummy values are enough: nothing here talks to Discord.
process.env.DISCORD_TOKEN ??= 'test-token';
process.env.CLIENT_ID ??= '1';
process.env.GUILD_ID ??= '1';
const { commands, contextMenuCommands } = await import('./index.ts');
const { buildHelpFields } = await import('./help.ts');

test('/help lists every registered command and menu', () => {
  const fields = buildHelpFields();
  const text = fields.map((f) => `${f.name}\n${f.value}`).join('\n');
  assert.ok(commands.size > 20, 'expected the registry to load');
  for (const name of commands.keys()) {
    assert.ok(text.includes(`/${name}`), `/${name} is registered but missing from /help`);
  }
  for (const name of contextMenuCommands.keys()) {
    assert.ok(text.includes(name), `the "${name}" menu is missing from /help`);
  }
});

test('/help fits Discord\'s embed limits', () => {
  const fields = buildHelpFields();
  assert.ok(fields.length <= 25, `${fields.length} fields`);
  for (const f of fields) assert.ok(f.value.length <= 1024, `${f.name}: ${f.value.length} chars`);
  const total = fields.reduce((n, f) => n + f.name.length + f.value.length, 0)
    + 'just-a-bot — commands'.length + 'Coins are hypothetical. No real payments are made.'.length;
  assert.ok(total <= 6000, `${total} chars in total`);
});
