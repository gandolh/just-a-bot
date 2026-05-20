import { rollExpression } from './dice.ts';
import {
  CharacterSheet,
  Entity,
  MonsterEntity,
  modifier,
  terrainAt,
  isWalkableTerrain,
  World,
} from './world.ts';
import { logAction, speedOf } from './encounter.ts';

const FLAVOR: Record<string, string[]> = {
  goblin: [
    '*A goblin cackles and waves its rusty blade.*',
    '*"Shiny things! Shiny things!" the goblin shrieks.*',
    '*The goblin scuttles forward with a wicked grin.*',
    '*"You die now!" hisses the goblin.*',
  ],
  wolf: [
    '*The wolf bares its fangs and snarls.*',
    '*Yellow eyes lock onto prey.*',
    '*The wolf circles, low and silent.*',
    '*A long, hungry howl echoes off the walls.*',
  ],
  orc: [
    '*The orc roars and slams its weapon against the ground.*',
    '*"Blood for the chief!" bellows the orc.*',
    '*The orc spits and lunges.*',
  ],
  skeleton: [
    '*Bones rattle as the skeleton advances.*',
    '*The skeleton\'s empty sockets fix on the living.*',
    '*A dry clatter — the skeleton raises its weapon.*',
  ],
  zombie: [
    '*The zombie shambles closer, groaning.*',
    '*"Uuhhhrrr…" the zombie reaches out with cold hands.*',
    '*Rotting feet drag across the floor.*',
  ],
  bandit: [
    '*"Your gold or your life!" snarls the bandit.*',
    '*The bandit grins through broken teeth.*',
    '*"You picked the wrong road, friend."*',
  ],
};

const GENERIC_FLAVOR = [
  '*The creature growls and steps forward.*',
  '*It eyes you with hostile intent.*',
  '*The creature attacks!*',
  '*A guttural sound — it has chosen its target.*',
];

const AI_AGGRO_RANGE_FT = 60; // monsters won't chase targets further than this

export function pickFlavor(monster: MonsterEntity): string {
  const pool = (monster.srdSlug && FLAVOR[monster.srdSlug]) || GENERIC_FLAVOR;
  return pool[Math.floor(Math.random() * pool.length)];
}

function chebyshev(a: [number, number], b: [number, number]): number {
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));
}

function targetsFor(world: World, monster: MonsterEntity): {
  id: string;
  pos: [number, number];
  ac: number;
  hp: number;
  name: string;
}[] {
  const out: { id: string; pos: [number, number]; ac: number; hp: number; name: string }[] = [];
  for (const [id, e] of Object.entries(world.entities)) {
    if (e.kind !== 'pc') continue;
    const sheet = world.characters[e.characterId];
    if (!sheet) continue;
    if (sheet.hp.current <= 0) continue;
    if (chebyshev(monster.pos, e.pos) * 5 > AI_AGGRO_RANGE_FT) continue;
    out.push({ id, pos: e.pos, ac: sheet.ac, hp: sheet.hp.current, name: sheet.name });
  }
  return out;
}

function stepToward(
  world: World,
  from: [number, number],
  to: [number, number],
  steps: number,
  occupied: Set<string>,
): [number, number] {
  let [r, c] = from;
  for (let i = 0; i < steps; i++) {
    const dr = Math.sign(to[0] - r);
    const dc = Math.sign(to[1] - c);
    if (dr === 0 && dc === 0) break;
    const candidates: [number, number][] = [
      [r + dr, c + dc],
      [r + dr, c],
      [r, c + dc],
    ];
    let moved = false;
    for (const [nr, nc] of candidates) {
      if (!isWalkableTerrain(terrainAt(world, nr, nc))) continue;
      const key = `${nr},${nc}`;
      if (occupied.has(key)) continue;
      r = nr;
      c = nc;
      moved = true;
      occupied.add(key);
      break;
    }
    if (!moved) break;
  }
  return [r, c];
}

function parseAttackAction(desc: string): { toHit: number; damageDice: string; damageType: string } | null {
  const hit = desc.match(/([+-]\d+)\s*to hit/i);
  const dmg = desc.match(/Hit:\s*\d+\s*\((\d*d\d+(?:\s*[+-]\s*\d+)?)\)\s*(\w+)\s*damage/i);
  if (!hit || !dmg) return null;
  const toHit = parseInt(hit[1], 10);
  const damageDice = dmg[1].replace(/\s+/g, '');
  const damageType = dmg[2];
  return { toHit, damageDice, damageType };
}

function reachOfAction(desc: string): number {
  const reach = desc.match(/reach\s+(\d+)\s*ft/i);
  if (reach) return parseInt(reach[1], 10);
  const range = desc.match(/range\s+(\d+)/i);
  if (range) return parseInt(range[1], 10);
  return 5;
}

export interface AiTurnReport {
  flavor: string;
  lines: string[];
}

export function runMonsterTurn(world: World, monsterId: string): AiTurnReport {
  const monster = world.entities[monsterId];
  if (!monster || monster.kind !== 'monster') {
    return { flavor: '', lines: [`\`${monsterId}\` is not a monster.`] };
  }
  const enc = world.encounter;
  if (!enc) return { flavor: '', lines: ['No encounter active.'] };

  const targets = targetsFor(world, monster);
  if (targets.length === 0) {
    const flavor = pickFlavor(monster);
    logAction(enc, monsterId, 'found no targets in range and waited');
    return { flavor, lines: ['No living targets nearby — the creature waits.'] };
  }

  targets.sort((a, b) => chebyshev(monster.pos, a.pos) - chebyshev(monster.pos, b.pos));
  const target = targets[0];

  const action = monster.statBlock.actions[0];
  if (!action) {
    logAction(enc, monsterId, 'has no actions and growls');
    return { flavor: pickFlavor(monster), lines: ['The creature has no attacks. It glares menacingly.'] };
  }
  const parsed = parseAttackAction(action.desc);
  const reach = reachOfAction(action.desc);

  const lines: string[] = [];
  const flavor = pickFlavor(monster);

  const speedFt = Math.max(0, Math.min(speedOf(world, monsterId), 60));
  const stepsAvail = Math.floor(speedFt / 5);
  const distNow = chebyshev(monster.pos, target.pos) * 5;

  const occupied = new Set<string>();
  for (const e of Object.values(world.entities)) {
    occupied.add(`${e.pos[0]},${e.pos[1]}`);
  }
  occupied.delete(`${monster.pos[0]},${monster.pos[1]}`);

  const beforePos: [number, number] = [monster.pos[0], monster.pos[1]];
  let newPos = beforePos;
  if (distNow > reach && stepsAvail > 0) {
    newPos = stepToward(world, beforePos, target.pos, stepsAvail, occupied);
    if (newPos[0] !== beforePos[0] || newPos[1] !== beforePos[1]) {
      monster.pos = newPos;
      const moved = chebyshev(beforePos, newPos) * 5;
      lines.push(`🏃 Moved from (${beforePos[0]},${beforePos[1]}) to (${newPos[0]},${newPos[1]}) — ${moved} ft.`);
    }
  }

  const distAfter = chebyshev(newPos, target.pos) * 5;
  if (distAfter > reach) {
    lines.push(`Too far to reach **${target.name}** (${distAfter} ft, needs ${reach}).`);
    logAction(enc, monsterId, `moved toward ${target.id} but couldn't reach`);
    return { flavor, lines };
  }
  if (!parsed) {
    lines.push(`Tries to use **${action.name}** but the bot can't parse the action.`);
    logAction(enc, monsterId, `attempted ${action.name} (unparseable)`);
    return { flavor, lines };
  }

  const attack = rollExpression(`1d20${parsed.toHit >= 0 ? '+' : ''}${parsed.toHit}`);
  const nat = attack.rolls[0].values[0];
  const autoMiss = nat === 1;
  const crit = nat === 20;
  const hit = !autoMiss && (crit || attack.total >= target.ac);

  lines.push(
    `**${action.name}** vs **${target.name}** (AC ${target.ac}): \`1d20${parsed.toHit >= 0 ? '+' : ''}${parsed.toHit}\` → ${attack.breakdown} = **${attack.total}** — ${autoMiss ? 'nat 1, miss' : hit ? (crit ? '**CRIT!**' : 'hit') : 'miss'}.`,
  );

  if (hit) {
    const dmgExpr = crit ? doubleDice(parsed.damageDice) : parsed.damageDice;
    const dmgRoll = rollExpression(dmgExpr);
    const dmg = Math.max(0, dmgRoll.total);
    const before = target.hp;
    applyDamageToPc(world, target.id, dmg);
    const sheet = pcSheet(world, target.id);
    const after = sheet?.hp.current ?? before;
    lines.push(`Damage: \`${dmgExpr}\` → ${dmgRoll.breakdown} = **${dmg}** ${parsed.damageType}. ${target.name}: ${before} → **${after}** HP.`);
    if (after === 0) lines.push(`💀 **${target.name}** falls unconscious!`);
    logAction(enc, monsterId, `attacked ${target.id} for ${dmg} damage${crit ? ' (crit)' : ''}`);
  } else {
    logAction(enc, monsterId, `attacked ${target.id} and missed`);
  }

  return { flavor, lines };
}

function pcSheet(world: World, entityId: string): CharacterSheet | undefined {
  const e: Entity | undefined = world.entities[entityId];
  if (!e || e.kind !== 'pc') return undefined;
  return world.characters[e.characterId];
}

function applyDamageToPc(world: World, entityId: string, dmg: number): void {
  const sheet = pcSheet(world, entityId);
  if (!sheet) return;
  sheet.hp.current = Math.max(0, sheet.hp.current - dmg);
  if (sheet.hp.current === 0 && !sheet.conditions.includes('unconscious')) {
    sheet.conditions.push('unconscious');
  }
}

function doubleDice(expr: string): string {
  return expr.replace(/(\d*)d(\d+)/gi, (_, c, s) => `${(c ? parseInt(c, 10) : 1) * 2}d${s}`);
}

void modifier;
