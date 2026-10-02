import { Trade, TradeOffer, World, nextId } from './world.ts';

export function startTrade(
  world: World,
  aId: string,
  bId: string,
  messageId: string,
  channelId: string,
): Trade {
  const id = nextId(world, 'trade');
  const trade: Trade = {
    id,
    aId,
    bId,
    aOffer: { coins: 0, items: [] },
    bOffer: { coins: 0, items: [] },
    aConfirmed: false,
    bConfirmed: false,
    state: 'open',
    messageId,
    channelId,
  };
  world.trades[id] = trade;
  return trade;
}

export function sideOf(trade: Trade, userId: string): 'a' | 'b' | null {
  if (trade.aId === userId) return 'a';
  if (trade.bId === userId) return 'b';
  return null;
}

function offerOf(trade: Trade, side: 'a' | 'b'): TradeOffer {
  return side === 'a' ? trade.aOffer : trade.bOffer;
}

export function adjustCoins(trade: Trade, side: 'a' | 'b', delta: number, world: World): boolean {
  const userId = side === 'a' ? trade.aId : trade.bId;
  const char = world.chars[userId];
  if (!char) return false;
  const offer = offerOf(trade, side);
  const next = offer.coins + delta;
  if (next < 0 || next > char.coins) return false;
  offer.coins = next;
  // Any change invalidates both confirmations so both must re-confirm.
  trade.aConfirmed = false;
  trade.bConfirmed = false;
  return true;
}

export function toggleItem(
  trade: Trade,
  side: 'a' | 'b',
  item: string,
  world: World,
): boolean {
  const userId = side === 'a' ? trade.aId : trade.bId;
  const char = world.chars[userId];
  if (!char) return false;
  const offer = offerOf(trade, side);
  const idx = offer.items.indexOf(item);
  if (idx >= 0) {
    offer.items.splice(idx, 1);
  } else {
    // Ensure the player actually has this item (not already offered).
    const alreadyOffered = offer.items.filter((i) => i === item).length;
    const ownedCount = char.inventory.filter((i) => i === item).length;
    if (alreadyOffered >= ownedCount) return false;
    offer.items.push(item);
  }
  trade.aConfirmed = false;
  trade.bConfirmed = false;
  return true;
}

export function confirmSide(trade: Trade, side: 'a' | 'b'): void {
  if (side === 'a') trade.aConfirmed = true;
  else trade.bConfirmed = true;
}

export function cancelTrade(trade: Trade): void {
  trade.state = 'cancelled';
  trade.aConfirmed = false;
  trade.bConfirmed = false;
}

export interface ExecuteTradeResult {
  ok: boolean;
  reason?: string;
}

export function executeTrade(world: World, trade: Trade): ExecuteTradeResult {
  if (trade.state !== 'open') return { ok: false, reason: 'Trade is no longer open.' };
  if (!trade.aConfirmed || !trade.bConfirmed) return { ok: false, reason: 'Both sides must confirm.' };

  const a = world.chars[trade.aId];
  const b = world.chars[trade.bId];
  if (!a || !b) return { ok: false, reason: 'One or both players have left the world.' };

  // Validate that each side still owns what they offered.
  if (a.coins < trade.aOffer.coins) return { ok: false, reason: `${a.name} no longer has enough coins.` };
  if (b.coins < trade.bOffer.coins) return { ok: false, reason: `${b.name} no longer has enough coins.` };

  // Count, don't just check presence: an offer of two Swords against an
  // inventory that has since dropped to one must fail. `includes` passed it, and
  // the transfer below then handed over a Sword that no longer existed.
  const shortA = missingItem(a.inventory, trade.aOffer.items);
  if (shortA !== undefined) return { ok: false, reason: `${a.name} no longer has ${shortA}.` };
  const shortB = missingItem(b.inventory, trade.bOffer.items);
  if (shortB !== undefined) return { ok: false, reason: `${b.name} no longer has ${shortB}.` };

  // Atomic swap.
  a.coins -= trade.aOffer.coins;
  b.coins -= trade.bOffer.coins;
  a.coins += trade.bOffer.coins;
  b.coins += trade.aOffer.coins;

  moveItems(a.inventory, b.inventory, trade.aOffer.items);
  moveItems(b.inventory, a.inventory, trade.bOffer.items);

  trade.state = 'completed';
  return { ok: true };
}

/** The first offered item the inventory holds fewer copies of than offered. */
function missingItem(inventory: readonly string[], offered: readonly string[]): string | undefined {
  const wanted = new Map<string, number>();
  for (const item of offered) wanted.set(item, (wanted.get(item) ?? 0) + 1);
  for (const [item, count] of wanted) {
    if (inventory.filter((owned) => owned === item).length < count) return item;
  }
  return undefined;
}

/**
 * Move each offered item from one inventory to the other, one copy at a time.
 * The receiver only gets a copy the giver actually lost, so if validation ever
 * slips, an item goes missing rather than being duplicated.
 */
function moveItems(from: string[], to: string[], items: readonly string[]): void {
  for (const item of items) {
    const idx = from.indexOf(item);
    if (idx < 0) continue;
    from.splice(idx, 1);
    to.push(item);
  }
}
