import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeCharacter } from '../commands/rpg.ts';
import { crierMessage } from './crier.ts';
import { cleanCharacterName, type World } from './world.ts';

const emptyWorld = () => ({ chars: {} }) as unknown as World;

test('creating a character named <@1> stores a cleaned name', () => {
  const char = makeCharacter(emptyWorld(), '42', '<@1>', null, 'dana');
  assert.equal(char.name, 'dana', 'nothing left, so the Discord username');
  assert.equal(makeCharacter(emptyWorld(), '42', 'Sir <@1> the Bold', null, 'dana').name, 'Sir the Bold');
});

test('mention syntax, @everyone, @here and backticks are stripped', () => {
  assert.equal(cleanCharacterName('<@123456789012345678>'), '');
  assert.equal(cleanCharacterName('<@!123> <@&456> <#789>x'), 'x');
  assert.equal(cleanCharacterName('@everyone @Here hi'), 'hi');
  assert.equal(cleanCharacterName('`code` name'), 'code name');
  assert.equal(cleanCharacterName('  Grim   the  Grey  '), 'Grim the Grey');
  assert.equal(cleanCharacterName('Ünïcødé 🧙 name'), 'Ünïcødé 🧙 name', 'ordinary text is untouched');
  assert.ok(cleanCharacterName('x'.repeat(40)).length <= 24);
});

test('crier posts parse no mentions', () => {
  const message = crierMessage(['✨ 🧙 **Grim** reached level **3**!']);
  assert.deepEqual(message.allowedMentions, { parse: [] });
  assert.match(message.content, /^📜 \*\*Town crier\*\*\n/);
});
