import { Ability, CharacterSheet } from './world.ts';

export type TemplateKey = 'fighter' | 'wizard' | 'rogue' | 'cleric';

export interface Template {
  class: string;
  abilities: Record<Ability, number>;
  hp: number;
  ac: number;
  speed: number;
  proficiencies: { savingThrows: Ability[]; skills: string[] };
  inventory: { item: string; qty: number }[];
  equipped: CharacterSheet['equipped'];
  knownSpells: string[];
  notes: string;
}

export const TEMPLATES: Record<TemplateKey, Template> = {
  fighter: {
    class: 'fighter',
    abilities: { str: 16, dex: 13, con: 14, int: 10, wis: 12, cha: 8 },
    hp: 12,
    ac: 16,
    speed: 30,
    proficiencies: { savingThrows: ['str', 'con'], skills: ['athletics', 'intimidation'] },
    inventory: [
      { item: 'longsword', qty: 1 },
      { item: 'shortbow', qty: 1 },
      { item: 'potion-of-healing', qty: 1 },
    ],
    equipped: { mainHand: 'longsword', armor: 'chain-mail' },
    knownSpells: [],
    notes: 'Stout and steady.',
  },
  wizard: {
    class: 'wizard',
    abilities: { str: 8, dex: 14, con: 13, int: 16, wis: 12, cha: 10 },
    hp: 8,
    ac: 12,
    speed: 30,
    proficiencies: { savingThrows: ['int', 'wis'], skills: ['arcana', 'investigation'] },
    inventory: [
      { item: 'quarterstaff', qty: 1 },
      { item: 'dagger', qty: 1 },
      { item: 'potion-of-healing', qty: 1 },
    ],
    equipped: { mainHand: 'quarterstaff' },
    knownSpells: ['fire-bolt', 'mage-hand', 'magic-missile'],
    notes: 'Cantrips at the ready.',
  },
  rogue: {
    class: 'rogue',
    abilities: { str: 10, dex: 16, con: 13, int: 12, wis: 12, cha: 14 },
    hp: 10,
    ac: 14,
    speed: 30,
    proficiencies: { savingThrows: ['dex', 'int'], skills: ['stealth', 'sleight-of-hand', 'perception'] },
    inventory: [
      { item: 'shortsword', qty: 1 },
      { item: 'shortbow', qty: 1 },
      { item: 'dagger', qty: 2 },
      { item: 'potion-of-healing', qty: 1 },
    ],
    equipped: { mainHand: 'shortsword' },
    knownSpells: [],
    notes: 'Stays in the shadows.',
  },
  cleric: {
    class: 'cleric',
    abilities: { str: 14, dex: 10, con: 13, int: 10, wis: 16, cha: 12 },
    hp: 10,
    ac: 16,
    speed: 30,
    proficiencies: { savingThrows: ['wis', 'cha'], skills: ['medicine', 'religion'] },
    inventory: [
      { item: 'mace', qty: 1 },
      { item: 'potion-of-healing', qty: 2 },
    ],
    equipped: { mainHand: 'mace', offHand: 'shield', armor: 'chain-mail' },
    knownSpells: ['sacred-flame', 'cure-wounds', 'guiding-bolt'],
    notes: 'Heals when needed.',
  },
};

export function applyTemplate(name: string, race: string, t: Template): CharacterSheet {
  return {
    name,
    class: t.class,
    level: 1,
    race,
    abilities: t.abilities,
    proficiencyBonus: 2,
    proficiencies: { ...t.proficiencies },
    hp: { current: t.hp, max: t.hp, temp: 0 },
    ac: t.ac,
    speed: t.speed,
    conditions: [],
    equipped: { ...t.equipped },
    inventory: t.inventory.map((i) => ({ ...i })),
    spellSlots: {},
    knownSpells: [...t.knownSpells],
    notes: t.notes,
  };
}
