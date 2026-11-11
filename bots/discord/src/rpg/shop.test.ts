import { test } from "node:test";
import assert from "node:assert/strict";
import { ITEMS } from "./items.ts";
import { buildRows, doSell } from "./locationui.ts";
import type { Character, World } from "./world.ts";

const wearer = () =>
  ({
    userId: "A",
    name: "A",
    glyph: "🧙",
    locationId: "plaza",
    coins: 10,
    inventory: ["rusty-dagger"],
    equipment: { weapon: "rusty-dagger", armor: null },
  }) as unknown as Character;
const world = (char: Character) =>
  ({ guildId: "g", chars: { A: char }, duels: {}, trades: {}, nextId: 1 }) as unknown as World;

const sellOptions = (w: World, char: Character): string[] =>
  buildRows(w, char, "town")
    .map((row) => row.toJSON())
    .flatMap((row) => row.components)
    .filter((c) => "custom_id" in c && c.custom_id === "rpg:ctl:sellsel")
    .flatMap((c) => ("options" in c ? c.options.map((o) => o.value) : []));

test("a spare copy of the worn weapon is in the sell menu and sells; the worn one stays worn", () => {
  const char = wearer();
  const w = world(char);
  assert.deepEqual(sellOptions(w, char), ["rusty-dagger"]);

  const res = doSell(char, "rusty-dagger");
  assert.equal(res.ok, true, res.banner);
  assert.deepEqual(char.inventory, []);
  assert.equal(char.equipment.weapon, "rusty-dagger");
  assert.equal(char.coins, 10 + ITEMS["rusty-dagger"]!.sell);
});

test("the worn copy alone is not sellable", () => {
  const char = wearer();
  char.inventory = [];
  assert.deepEqual(sellOptions(world(char), char), []);

  const res = doSell(char, "rusty-dagger");
  assert.equal(res.ok, false);
  assert.equal(char.equipment.weapon, "rusty-dagger");
  assert.equal(char.coins, 10);
});
