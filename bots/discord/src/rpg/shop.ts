import type { Character } from './world.ts';
import { getItem, type ItemDef, shopCatalog } from './items.ts';

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

// Equipping takes an item out of the bag, so a worn item is never in
// `inventory` and can't be sold here; a spare copy in the bag can.
export function sellItem(char: Character, slug: string): SellResult {
  const item = getItem(slug);
  if (!item) return { ok: false, reason: `Unknown item **${slug}**.` };
  const idx = char.inventory.indexOf(slug);
  if (idx < 0) return { ok: false, reason: `You don't have a **${item.label}** to sell.` };
  char.inventory.splice(idx, 1);
  char.coins += item.sell;
  return { ok: true, item, gained: item.sell };
}

export function catalog(): ItemDef[] {
  return shopCatalog();
}
