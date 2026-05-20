const BASE = 'https://www.dnd5eapi.co/api/2014';

export type Resource = 'spells' | 'monsters' | 'equipment' | 'conditions';

interface IndexEntry {
  index: string;
  name: string;
  url: string;
}

interface IndexResponse {
  count: number;
  results: IndexEntry[];
}

const cache = new Map<string, unknown>();

async function fetchJson<T>(path: string): Promise<T> {
  if (cache.has(path)) return cache.get(path) as T;
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`SRD ${path} → ${res.status}`);
  const data = (await res.json()) as T;
  cache.set(path, data);
  return data;
}

function slugify(query: string): string {
  return query
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-');
}

export async function lookup<T>(resource: Resource, query: string): Promise<T | null> {
  const slug = slugify(query);
  try {
    return await fetchJson<T>(`/${resource}/${slug}`);
  } catch {
    const index = await fetchJson<IndexResponse>(`/${resource}`);
    const lower = query.toLowerCase();
    const exact = index.results.find((r) => r.name.toLowerCase() === lower);
    const partial = exact ?? index.results.find((r) => r.name.toLowerCase().includes(lower));
    if (!partial) return null;
    return fetchJson<T>(partial.url.replace('/api/2014', ''));
  }
}

export interface SpellData {
  name: string;
  desc: string[];
  higher_level?: string[];
  range: string;
  components: string[];
  material?: string;
  ritual?: boolean;
  duration: string;
  concentration?: boolean;
  casting_time: string;
  level: number;
  school: { name: string };
  classes: { name: string }[];
  damage?: {
    damage_type?: { name: string };
    damage_at_slot_level?: Record<string, string>;
    damage_at_character_level?: Record<string, string>;
  };
}

export interface MonsterData {
  name: string;
  size: string;
  type: string;
  alignment: string;
  armor_class: { type: string; value: number }[];
  hit_points: number;
  hit_dice: string;
  speed: Record<string, string>;
  strength: number;
  dexterity: number;
  constitution: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
  challenge_rating: number;
  xp: number;
  actions?: { name: string; desc: string }[];
  special_abilities?: { name: string; desc: string }[];
}

export interface EquipmentData {
  name: string;
  equipment_category: { name: string };
  cost?: { quantity: number; unit: string };
  weight?: number;
  desc?: string[];
  damage?: { damage_dice: string; damage_type: { name: string } };
  range?: { normal: number; long?: number };
  weapon_category?: string;
  armor_class?: { base: number; dex_bonus?: boolean };
}

export interface ConditionData {
  name: string;
  desc: string[];
}
