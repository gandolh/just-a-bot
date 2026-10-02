import { test } from 'node:test';
import assert from 'node:assert/strict';
import { confirmSide, executeTrade, startTrade } from './trade.ts';
import type { Character, World } from './world.ts';

const char = (userId: string, inventory: string[], coins: number) =>
  ({ userId, name: userId, inventory, coins }) as unknown as Character;
const world = (a: [string[], number], b: [string[], number]) =>
  ({ chars: { A: char('A', ...a), B: char('B', ...b) }, trades: {}, nextId: 1 }) as unknown as World;
const count = (w: World, item: string) =>
  ['A', 'B'].reduce((n, id) => n + w.chars[id]!.inventory.filter((i) => i === item).length, 0);
const coins = (w: World) => w.chars.A!.coins + w.chars.B!.coins;

test('a successful trade conserves every item and the coin total', () => {
  const w = world([['sword', 'sword', 'potion'], 50], [['potion', 'shield'], 20]);
  const t = startTrade(w, 'A', 'B', 'msg', 'chan');
  t.aOffer = { coins: 10, items: ['sword', 'sword'] };
  t.bOffer = { coins: 5, items: ['shield'] };
  confirmSide(t, 'a');
  confirmSide(t, 'b');
  const before = { sword: count(w, 'sword'), potion: count(w, 'potion'), shield: count(w, 'shield'), coins: coins(w) };
  assert.deepEqual(executeTrade(w, t), { ok: true });
  assert.deepEqual(
    { sword: count(w, 'sword'), potion: count(w, 'potion'), shield: count(w, 'shield'), coins: coins(w) },
    before,
  );
  assert.equal(w.chars.B!.inventory.filter((i) => i === 'sword').length, 2);
  assert.equal(w.chars.A!.coins, 45);
});

test('an offer of more copies than the inventory still holds fails and changes nothing (brief 08)', () => {
  const w = world([['sword', 'sword'], 0], [[], 0]);
  const t = startTrade(w, 'A', 'B', 'msg', 'chan');
  t.aOffer.items = ['sword', 'sword'];
  confirmSide(t, 'a');
  w.chars.A!.inventory.splice(0, 1); // one sold after the offer was made
  confirmSide(t, 'b');
  const before = JSON.stringify(w.chars);
  assert.deepEqual(executeTrade(w, t), { ok: false, reason: 'A no longer has sword.' });
  assert.equal(JSON.stringify(w.chars), before);
});

test('an unconfirmed trade does not execute', () => {
  const w = world([['sword'], 0], [[], 0]);
  const t = startTrade(w, 'A', 'B', 'msg', 'chan');
  confirmSide(t, 'a');
  assert.equal(executeTrade(w, t).ok, false);
});
