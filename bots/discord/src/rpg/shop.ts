import { Character, World } from './world.ts';
import { getItem, ItemDef, shopCatalog } from './items.ts';

// The shop sits on the central plaza — players must stand on a plaza tile (`=`)
// to interact. This avoids a separate NPC entity and keeps the spawn area
// useful for high-level players too.
export function onPlaza(world: World, char: Character): boolean {
  const row = world.grid[char.pos[0]];
  return row?.[char.pos[1]] === '=';
}

export interface BuyResult {
  ok: boolean;
  reason?: string;
  item?: ItemDef;
  cost?: number;
}

export function buyItem(char: Character, slug: string): BuyResult {
  const item = getItem(slug);
  if (!item || item.buy === undefined) {
    return { ok: false, reason: `**${slug}** is not for sale at the shop.` };
  }
  if (char.coins < item.buy) {
    return { ok: false, reason: `Need ${item.buy} coins to buy ${item.label} — you have ${char.coins}.` };
  }
  char.coins -= item.buy;
  char.inventory.push(slug);
  return { ok: true, item, cost: item.buy };
}

export interface SellResult {
  ok: boolean;
  reason?: string;
  item?: ItemDef;
  gained?: number;
}

export function sellItem(char: Character, slug: string): SellResult {
  const item = getItem(slug);
  if (!item) return { ok: false, reason: `Unknown item **${slug}**.` };
  if (char.equipment.weapon === slug || char.equipment.armor === slug) {
    return { ok: false, reason: `${item.label} is equipped — unequip it first.` };
  }
  const idx = char.inventory.indexOf(slug);
  if (idx < 0) return { ok: false, reason: `You don't have a **${item.label}** to sell.` };
  char.inventory.splice(idx, 1);
  char.coins += item.sell;
  return { ok: true, item, gained: item.sell };
}

export function catalog(): ItemDef[] {
  return shopCatalog();
}
