import { Character, Loot, Mob, MOB_KINDS, World, cheby } from './world.ts';

const TERRAIN_EMOJI: Record<string, string> = {
  '.': '🟫',
  '#': '⬛',
  '~': '🟦',
  f: '🌲',
  '^': '⛰️',
  '=': '🟧',
};

const OUT_OF_BOUNDS = '⬛';
const LOOT_EMOJI = '💰';

function tokenEmoji(token: string): string {
  return TERRAIN_EMOJI[token] ?? OUT_OF_BOUNDS;
}

export function renderViewport(world: World, center: [number, number], radius = 7): string {
  const halfW = radius;
  const halfH = Math.floor(radius * 0.7);
  const startR = center[0] - halfH;
  const startC = center[1] - halfW;
  const endR = startR + halfH * 2;
  const endC = startC + halfW * 2;

  const cellEmoji = new Map<string, string>();
  for (const m of Object.values(world.mobs)) {
    if (m.pos[0] < startR || m.pos[0] > endR || m.pos[1] < startC || m.pos[1] > endC) continue;
    cellEmoji.set(`${m.pos[0]},${m.pos[1]}`, MOB_KINDS[m.kind]?.glyph ?? '👹');
  }
  for (const l of Object.values(world.loot)) {
    if (l.pos[0] < startR || l.pos[0] > endR || l.pos[1] < startC || l.pos[1] > endC) continue;
    cellEmoji.set(`${l.pos[0]},${l.pos[1]}`, LOOT_EMOJI);
  }
  for (const c of Object.values(world.chars)) {
    if (c.hp <= 0) continue;
    if (c.pos[0] < startR || c.pos[0] > endR || c.pos[1] < startC || c.pos[1] > endC) continue;
    cellEmoji.set(`${c.pos[0]},${c.pos[1]}`, c.glyph);
  }

  const rows: string[] = [];
  for (let r = startR; r <= endR; r++) {
    let row = '';
    for (let c = startC; c <= endC; c++) {
      if (r < 0 || r >= world.height || c < 0 || c >= world.width) {
        row += OUT_OF_BOUNDS;
        continue;
      }
      const e = cellEmoji.get(`${r},${c}`);
      if (e) row += e;
      else row += tokenEmoji(world.grid[r][c]);
    }
    rows.push(row);
  }
  return rows.join('\n');
}

export interface NearbyEntry {
  emoji: string;
  label: string;
  pos: [number, number];
  distance: number;
}

export function listNearby(world: World, center: [number, number], radius = 7): NearbyEntry[] {
  const out: NearbyEntry[] = [];
  for (const c of Object.values(world.chars)) {
    if (c.hp <= 0) continue;
    const d = cheby(center, c.pos);
    if (d === 0 || d > radius) continue;
    out.push({
      emoji: c.glyph,
      label: `${c.name} (lvl ${c.level}, HP ${c.hp}/${c.maxHp})`,
      pos: c.pos,
      distance: d,
    });
  }
  for (const m of Object.values(world.mobs)) {
    const d = cheby(center, m.pos);
    if (d > radius) continue;
    const kind = MOB_KINDS[m.kind];
    out.push({
      emoji: kind?.glyph ?? '👹',
      label: `${kind?.name ?? m.kind} (HP ${m.hp}/${kind?.hp ?? '?'})`,
      pos: m.pos,
      distance: d,
    });
  }
  for (const l of Object.values(world.loot)) {
    const d = cheby(center, l.pos);
    if (d > radius) continue;
    out.push({
      emoji: LOOT_EMOJI,
      label: l.item,
      pos: l.pos,
      distance: d,
    });
  }
  out.sort((a, b) => a.distance - b.distance);
  return out;
}

export function legend(): string {
  return [
    `${TERRAIN_EMOJI['.']} ground`,
    `${TERRAIN_EMOJI['=']} plaza`,
    `${TERRAIN_EMOJI['f']} forest`,
    `${TERRAIN_EMOJI['~']} water`,
    `${TERRAIN_EMOJI['^']} mountain`,
    `${TERRAIN_EMOJI['#']} wall`,
    `${LOOT_EMOJI} loot`,
  ].join(' • ');
}
