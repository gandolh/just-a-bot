import { Character, World } from './world.ts';
import { LocationDef } from './locations.ts';
import { startEncounter } from './combat.ts';

// The outcome of pressing Explore at a location.
export type ExploreResult =
  | { kind: 'combat'; mobKind: string; text: string }
  | { kind: 'loot'; item: string; text: string }
  | { kind: 'coins'; amount: number; text: string }
  | { kind: 'flavor'; text: string };

const FLAVOR = [
  'You pick your way through the brush and find nothing of note.',
  'A cold wind passes. The way is quiet.',
  'You search a while but the trail goes cold.',
  'Birdsong, then silence. Nothing stirs.',
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Roll an explore event for the player's current location. Combat is the most
// likely outcome in dangerous places; the hub (no mobs) only yields flavour.
export function rollExplore(world: World, char: Character, loc: LocationDef): ExploreResult {
  // Safe hub or a location with no mobs: only minor finds.
  if (loc.mobs.length === 0) {
    if (Math.random() < 0.2) {
      const amount = 1 + Math.floor(Math.random() * 4);
      char.coins += amount;
      return { kind: 'coins', amount, text: `🪙 You find ${amount} stray coins underfoot.` };
    }
    return { kind: 'flavor', text: pick(FLAVOR) };
  }

  const r = Math.random();
  // 65% combat, 12% loot, 10% coins, 13% flavour.
  if (r < 0.65) {
    const mobKind = pick(loc.mobs);
    startEncounter(char, mobKind);
    return { kind: 'combat', mobKind, text: '' };
  }
  if (r < 0.77) {
    char.inventory.push('healing-potion');
    return { kind: 'loot', item: 'healing-potion', text: '💰 You find a **Healing Potion** stashed in the undergrowth.' };
  }
  if (r < 0.87) {
    const amount = 2 + Math.floor(Math.random() * (loc.danger * 6 + 4));
    char.coins += amount;
    return { kind: 'coins', amount, text: `🪙 You find a small purse — **${amount}** coins.` };
  }
  return { kind: 'flavor', text: pick(FLAVOR) };
}

// A travel-encounter roll: chance scales with the destination's danger. Returns
// a mob kind to fight, or null for a safe trip.
export function rollTravelEncounter(dest: LocationDef): string | null {
  if (dest.mobs.length === 0) return null;
  const chance = Math.min(0.5, 0.12 * dest.danger);
  if (Math.random() < chance) return dest.mobs[Math.floor(Math.random() * dest.mobs.length)];
  return null;
}
