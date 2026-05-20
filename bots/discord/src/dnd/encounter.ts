import { Encounter, Entity, modifier, World } from './world.ts';

export function rollD20(): number {
  return 1 + Math.floor(Math.random() * 20);
}

export function rollInitiative(world: World, entityId: string): number {
  const e = world.entities[entityId];
  if (!e) return rollD20();
  let dex = 10;
  if (e.kind === 'monster') dex = e.statBlock.abilities.dex;
  else if (e.kind === 'pc') {
    const sheet = world.characters[e.characterId];
    if (sheet) dex = sheet.abilities.dex;
  }
  return rollD20() + modifier(dex);
}

export function speedOf(world: World, entityId: string): number {
  const e = world.entities[entityId];
  if (!e) return 30;
  if (e.kind === 'pc') {
    const sheet = world.characters[e.characterId];
    return sheet?.speed ?? 30;
  }
  if (e.kind === 'monster') {
    const walk = e.statBlock.speed.walk ?? '30 ft';
    const n = parseInt(walk, 10);
    return Number.isFinite(n) ? n : 30;
  }
  return 30;
}

export function currentActor(encounter: Encounter): string | null {
  return encounter.order[encounter.turnIndex]?.entityId ?? null;
}

export function advanceTurn(encounter: Encounter): void {
  encounter.turnIndex++;
  if (encounter.turnIndex >= encounter.order.length) {
    encounter.turnIndex = 0;
    encounter.round++;
  }
  const actor = currentActor(encounter);
  if (actor) {
    // refresh movement budget for the new actor at the start of their turn
    encounter.movementBudget[actor] = encounter.movementBudget[actor] ?? 0;
  }
}

export function entityOwner(world: World, entityId: string): string | null {
  const e = world.entities[entityId];
  if (!e || e.kind !== 'pc') return null;
  return e.characterId;
}

export function entityForUser(world: World, userId: string): { id: string; entity: Entity } | null {
  for (const [id, e] of Object.entries(world.entities)) {
    if (e.kind === 'pc' && e.characterId === userId) return { id, entity: e };
  }
  return null;
}

export function logAction(
  encounter: Encounter,
  actor: string,
  action: string,
  rolls: unknown[] = [],
): void {
  encounter.log.push({ round: encounter.round, actor, action, rolls });
  if (encounter.log.length > 200) encounter.log.splice(0, encounter.log.length - 200);
}
