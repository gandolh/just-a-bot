import { World } from './world.ts';

// A location is a named place the player can be. Travel happens place-to-place
// via exits — there is no tile movement. Locations are derived deterministically
// from the per-guild world seed so each server has a stable, unique map, but the
// structure (a safe hub ringed by progressively more dangerous wilds) is fixed.

export interface LocationDef {
  id: string;
  name: string;
  glyph: string;
  // Flavour text shown when you're here.
  description: string;
  // 0 = safe hub (plaza). Higher = more dangerous; gates which mobs appear.
  danger: number;
  // ids of locations reachable from here.
  exits: string[];
  // Mob kinds that can be encountered here, by slug.
  mobs: string[];
  // Is this the shop/rest hub?
  hub: boolean;
}

// Hand-authored location TYPES. Which exist and how they connect is fixed; the
// names are seeded per guild for variety (see buildLocations).
interface LocationTemplate {
  id: string;
  glyph: string;
  names: string[]; // seed picks one
  description: string;
  danger: number;
  exits: string[];
  mobs: string[];
  hub?: boolean;
}

const TEMPLATES: LocationTemplate[] = [
  {
    id: 'plaza',
    glyph: '🟧',
    names: ['The Plaza', 'Last Light', 'The Hollow Market', 'Travellers’ Rest'],
    description: 'A cobbled square ringed by lantern-light. Merchants haggle and the wounded rest here — the only truly safe ground for miles.',
    danger: 0,
    exits: ['meadow', 'forest', 'river'],
    mobs: [],
    hub: true,
  },
  {
    id: 'meadow',
    glyph: '🟩',
    names: ['The Green Verge', 'Open Meadow', 'Sunless Fields'],
    description: 'Tall grass sways over gentle hills. Slimes ooze between the tussocks — a place for green adventurers to cut their teeth.',
    danger: 1,
    exits: ['plaza', 'forest', 'hills'],
    mobs: ['slime', 'goblin'],
  },
  {
    id: 'forest',
    glyph: '🌲',
    names: ['The North Woods', 'Tangle Pines', 'Whisperwood'],
    description: 'Crowded pines swallow the path. Something rustles in the undergrowth — goblins and wolves den in here.',
    danger: 2,
    exits: ['plaza', 'meadow', 'deepwoods'],
    mobs: ['goblin', 'wolf'],
  },
  {
    id: 'river',
    glyph: '🟦',
    names: ['Riverside', 'The Slow Ford', 'Reedwater'],
    description: 'A broad, slow river. Bandits work the crossings, preying on travellers who linger.',
    danger: 2,
    exits: ['plaza', 'hills'],
    mobs: ['wolf', 'bandit'],
  },
  {
    id: 'hills',
    glyph: '⛰️',
    names: ['The Stone Hills', 'Mountain Pass', 'The Broken Climb'],
    description: 'Bare ridges and scree. Orcs hold the high ground and bandits ambush the switchbacks.',
    danger: 3,
    exits: ['meadow', 'river', 'deepwoods'],
    mobs: ['bandit', 'orc'],
  },
  {
    id: 'deepwoods',
    glyph: '🌑',
    names: ['The Deep Woods', 'Gloomhollow', 'The Old Dark'],
    description: 'The canopy closes overhead and the air goes cold. Orcs roam, and they say a troll dens in the dark.',
    danger: 4,
    exits: ['forest', 'hills'],
    mobs: ['orc', 'troll'],
  },
];

// Deterministic per-seed picker so a guild always gets the same names.
function seedHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Build the concrete locations for a guild, choosing seeded names.
export function buildLocations(world: World): Record<string, LocationDef> {
  const base = seedHash(world.guildId);
  const out: Record<string, LocationDef> = {};
  TEMPLATES.forEach((t, i) => {
    const name = t.names[(base + i) % t.names.length];
    out[t.id] = {
      id: t.id,
      name,
      glyph: t.glyph,
      description: t.description,
      danger: t.danger,
      exits: t.exits,
      mobs: t.mobs,
      hub: t.hub ?? false,
    };
  });
  return out;
}

// Convenience: locations don't change at runtime, so callers can derive them
// fresh from the world whenever needed.
export function getLocation(world: World, id: string): LocationDef | null {
  return buildLocations(world)[id] ?? null;
}

export const STARTING_LOCATION = 'plaza';
