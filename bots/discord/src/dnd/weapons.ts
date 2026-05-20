export interface WeaponProfile {
  damageDice: string;
  damageType: string;
  ability: 'str' | 'dex';
  range: { normal: number; long?: number } | { melee: number };
  finesse?: boolean;
  twoHanded?: boolean;
}

const TABLE: Record<string, WeaponProfile> = {
  // Simple melee
  club:           { damageDice: '1d4', damageType: 'bludgeoning', ability: 'str', range: { melee: 5 } },
  dagger:         { damageDice: '1d4', damageType: 'piercing',    ability: 'dex', range: { melee: 5 }, finesse: true },
  handaxe:        { damageDice: '1d6', damageType: 'slashing',    ability: 'str', range: { melee: 5 } },
  mace:           { damageDice: '1d6', damageType: 'bludgeoning', ability: 'str', range: { melee: 5 } },
  quarterstaff:   { damageDice: '1d6', damageType: 'bludgeoning', ability: 'str', range: { melee: 5 } },
  spear:          { damageDice: '1d6', damageType: 'piercing',    ability: 'str', range: { melee: 5 } },
  // Martial melee
  longsword:      { damageDice: '1d8', damageType: 'slashing',    ability: 'str', range: { melee: 5 } },
  shortsword:     { damageDice: '1d6', damageType: 'piercing',    ability: 'dex', range: { melee: 5 }, finesse: true },
  rapier:         { damageDice: '1d8', damageType: 'piercing',    ability: 'dex', range: { melee: 5 }, finesse: true },
  scimitar:       { damageDice: '1d6', damageType: 'slashing',    ability: 'dex', range: { melee: 5 }, finesse: true },
  battleaxe:      { damageDice: '1d8', damageType: 'slashing',    ability: 'str', range: { melee: 5 } },
  warhammer:      { damageDice: '1d8', damageType: 'bludgeoning', ability: 'str', range: { melee: 5 } },
  greatsword:     { damageDice: '2d6', damageType: 'slashing',    ability: 'str', range: { melee: 5 }, twoHanded: true },
  greataxe:       { damageDice: '1d12', damageType: 'slashing',   ability: 'str', range: { melee: 5 }, twoHanded: true },
  // Ranged
  shortbow:       { damageDice: '1d6', damageType: 'piercing',    ability: 'dex', range: { normal: 80, long: 320 } },
  longbow:        { damageDice: '1d8', damageType: 'piercing',    ability: 'dex', range: { normal: 150, long: 600 } },
  crossbow:       { damageDice: '1d8', damageType: 'piercing',    ability: 'dex', range: { normal: 80, long: 320 } },
};

export function getWeapon(itemName: string | undefined): WeaponProfile | null {
  if (!itemName) return null;
  return TABLE[itemName.toLowerCase()] ?? null;
}

// Default unarmed strike when nothing is equipped.
export const UNARMED: WeaponProfile = {
  damageDice: '1',
  damageType: 'bludgeoning',
  ability: 'str',
  range: { melee: 5 },
};
