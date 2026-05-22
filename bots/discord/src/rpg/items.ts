export type ItemKind = 'weapon' | 'armor' | 'consumable' | 'material';

export interface ItemDef {
  slug: string;
  label: string;
  glyph: string;
  kind: ItemKind;
  atk?: number;
  def?: number;
  hp?: number;
  buy?: number;
  sell: number;
  desc?: string;
}

export const ITEMS: Record<string, ItemDef> = {
  'rusty-dagger': {
    slug: 'rusty-dagger', label: 'Rusty Dagger', glyph: '🗡️', kind: 'weapon',
    atk: 1, buy: 25, sell: 8, desc: '+1 ATK',
  },
  'iron-sword': {
    slug: 'iron-sword', label: 'Iron Sword', glyph: '⚔️', kind: 'weapon',
    atk: 3, buy: 120, sell: 50, desc: '+3 ATK',
  },
  'steel-sword': {
    slug: 'steel-sword', label: 'Steel Sword', glyph: '🗡️', kind: 'weapon',
    atk: 4, buy: 220, sell: 90, desc: '+4 ATK',
  },
  'greatsword': {
    slug: 'greatsword', label: 'Greatsword', glyph: '🪓', kind: 'weapon',
    atk: 5, sell: 140, desc: '+5 ATK (drop only — trolls)',
  },
  'leather-armor': {
    slug: 'leather-armor', label: 'Leather Armor', glyph: '🦺', kind: 'armor',
    def: 2, buy: 40, sell: 15, desc: '+2 DEF',
  },
  'chain-mail': {
    slug: 'chain-mail', label: 'Chain Mail', glyph: '🛡️', kind: 'armor',
    def: 4, buy: 260, sell: 100, desc: '+4 DEF',
  },
  'healing-potion': {
    slug: 'healing-potion', label: 'Healing Potion', glyph: '🧪', kind: 'consumable',
    buy: 15, sell: 6, desc: 'Restores 12 HP when used',
  },
  'slime-jelly': {
    slug: 'slime-jelly', label: 'Slime Jelly', glyph: '🟢', kind: 'material',
    sell: 2, desc: 'Sells at the plaza shop',
  },
  'wolf-pelt': {
    slug: 'wolf-pelt', label: 'Wolf Pelt', glyph: '🐺', kind: 'material',
    sell: 6, desc: 'Sells at the plaza shop',
  },
  'troll-tooth': {
    slug: 'troll-tooth', label: 'Troll Tooth', glyph: '🦷', kind: 'material',
    sell: 15, desc: 'Sells at the plaza shop',
  },
};

export function getItem(slug: string): ItemDef | undefined {
  return ITEMS[slug];
}

export function itemLabel(slug: string): string {
  return ITEMS[slug]?.label ?? slug;
}

export function shopCatalog(): ItemDef[] {
  return Object.values(ITEMS)
    .filter((i) => i.buy !== undefined)
    .sort((a, b) => (a.buy ?? 0) - (b.buy ?? 0));
}

export function isWeapon(slug: string): boolean {
  return ITEMS[slug]?.kind === 'weapon';
}

export function isArmor(slug: string): boolean {
  return ITEMS[slug]?.kind === 'armor';
}
