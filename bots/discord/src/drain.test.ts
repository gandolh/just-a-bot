import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { flushPendingWrites, writeJsonFile } from '@bots/shared';
import { drainStores } from './drain.ts';
import { flushAllWorlds, getOrCreateWorld, markDirty, setWorldWriterForTests } from './rpg/world.ts';

test('every flush runs to the end, and the failed ones are named', async () => {
  let writesDrained = false;
  const failed = await drainStores({
    worlds: async () => {
      throw new Error('EIO');
    },
    writes: async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      writesDrained = true;
    },
  });
  assert.deepEqual(failed, ['worlds']);
  assert.equal(writesDrained, true);
});

test('a world whose write fails stays dirty, and the other stores still land', async () => {
  const guild = `test-drain-${process.pid}`;
  const dir = await mkdtemp(join(tmpdir(), 'just-a-bot-drain-'));
  const written: string[] = [];
  let failing = true;
  const restore = setWorldWriterForTests(async (file) => {
    if (failing) throw Object.assign(new Error('no space left on device'), { code: 'ENOSPC' });
    written.push(file);
  });
  try {
    failing = false;
    await getOrCreateWorld(guild); // Creating a world writes it once.
    written.length = 0;
    failing = true;

    markDirty(guild);
    const wallet = join(dir, 'wallets.json');
    void writeJsonFile(wallet, '{"coins":5}').catch(() => {});
    const failed = await drainStores({ 'RPG worlds': flushAllWorlds, 'pending writes': flushPendingWrites });

    assert.deepEqual(failed, ['RPG worlds']);
    assert.equal(await readFile(wallet, 'utf8'), '{"coins":5}', "another store's write landed");

    // Still dirty: the next flush writes it.
    failing = false;
    await flushAllWorlds();
    assert.equal(written.length, 1);
    assert.match(written[0], new RegExp(`${guild}\\.json$`));
  } finally {
    restore();
    await rm(dir, { recursive: true, force: true });
  }
});
