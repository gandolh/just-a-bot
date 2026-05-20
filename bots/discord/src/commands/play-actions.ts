import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
} from 'discord.js';
import {
  CharacterSheet,
  isWalkableTerrain,
  loadWorld,
  modifier,
  movementCost,
  PcEntity,
  terrainAt,
  updateWorld,
  World,
  zoneAt,
} from '../dnd/world.ts';
import {
  currentActor,
  entityForUser,
  logAction,
} from '../dnd/encounter.ts';
import { rollExpression } from '../dnd/dice.ts';
import { getWeapon, UNARMED, WeaponProfile } from '../dnd/weapons.ts';
import type { Command } from './types.ts';

async function requireWorld(interaction: ChatInputCommandInteraction): Promise<World | null> {
  if (!interaction.inCachedGuild()) {
    await interaction.reply({ content: 'Use this in a server.', ephemeral: true });
    return null;
  }
  const world = await loadWorld(interaction.guildId!);
  if (!world) {
    await interaction.reply({ content: 'No world here yet.', ephemeral: true });
    return null;
  }
  return world;
}

interface ActiveCtx {
  pcId: string;
  pc: PcEntity;
  sheet: CharacterSheet;
}

async function requirePc(
  interaction: ChatInputCommandInteraction,
  world: World,
): Promise<ActiveCtx | null> {
  const owner = entityForUser(world, interaction.user.id);
  if (!owner || owner.entity.kind !== 'pc') {
    await interaction.reply({ content: 'You have no character placed in this world.', ephemeral: true });
    return null;
  }
  const sheet = world.characters[owner.entity.characterId];
  if (!sheet) {
    await interaction.reply({ content: 'Your character sheet is missing.', ephemeral: true });
    return null;
  }
  return { pcId: owner.id, pc: owner.entity, sheet };
}

async function requireActiveTurn(
  interaction: ChatInputCommandInteraction,
  world: World,
): Promise<ActiveCtx | null> {
  if (!world.encounter) {
    await interaction.reply({ content: 'No encounter is active.', ephemeral: true });
    return null;
  }
  const ctx = await requirePc(interaction, world);
  if (!ctx) return null;
  const actorId = currentActor(world.encounter);
  if (actorId !== ctx.pcId) {
    await interaction.reply({ content: `It's not your turn. Current actor: \`${actorId}\`.`, ephemeral: true });
    return null;
  }
  return ctx;
}

function chebyshev(a: [number, number], b: [number, number]): number {
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));
}

// Walks one cell at a time from `from` toward `to` via Chebyshev steps,
// adding up the per-cell movement cost (in cells, then converted to feet).
// Returns null if the path passes through impassable terrain.
function tracePath(
  world: World,
  from: [number, number],
  to: [number, number],
): { feetCost: number } | null {
  const [fr, fc] = from;
  const [tr, tc] = to;
  const steps = chebyshev(from, to);
  if (steps === 0) return { feetCost: 0 };
  let r = fr;
  let c = fc;
  let cells = 0;
  for (let i = 0; i < steps; i++) {
    r += Math.sign(tr - r);
    c += Math.sign(tc - c);
    const t = terrainAt(world, r, c);
    if (!isWalkableTerrain(t)) return null;
    cells += movementCost(t);
  }
  return { feetCost: cells * 5 };
}

const DIRS: Record<string, [number, number]> = {
  north: [-1, 0],
  south: [1, 0],
  east: [0, 1],
  west: [0, -1],
  ne: [-1, 1],
  nw: [-1, -1],
  se: [1, 1],
  sw: [1, -1],
};

export const move: Command = {
  data: new SlashCommandBuilder()
    .setName('move')
    .setDescription('Move your character on the overworld')
    .addStringOption((o) =>
      o.setName('direction').setDescription('Cardinal direction (overrides row/col)').addChoices(
        { name: 'north', value: 'north' },
        { name: 'south', value: 'south' },
        { name: 'east', value: 'east' },
        { name: 'west', value: 'west' },
        { name: 'northeast', value: 'ne' },
        { name: 'northwest', value: 'nw' },
        { name: 'southeast', value: 'se' },
        { name: 'southwest', value: 'sw' },
      ),
    )
    .addIntegerOption((o) => o.setName('steps').setDescription('Cells to move in that direction (default 1)').setMinValue(1).setMaxValue(20))
    .addIntegerOption((o) => o.setName('row').setDescription('Target row (overworld)').setMinValue(0))
    .addIntegerOption((o) => o.setName('col').setDescription('Target column (overworld)').setMinValue(0)),
  async execute(interaction) {
    const world = await requireWorld(interaction);
    if (!world) return;
    const ctx = await requirePc(interaction, world);
    if (!ctx) return;

    const dir = interaction.options.getString('direction');
    const steps = interaction.options.getInteger('steps') ?? 1;
    const targetRow = interaction.options.getInteger('row');
    const targetCol = interaction.options.getInteger('col');

    let to: [number, number];
    if (dir) {
      const [dr, dc] = DIRS[dir];
      to = [ctx.pc.pos[0] + dr * steps, ctx.pc.pos[1] + dc * steps];
    } else if (targetRow !== null && targetCol !== null) {
      to = [targetRow, targetCol];
    } else {
      await interaction.reply({ content: 'Provide a `direction` or both `row` and `col`.', ephemeral: true });
      return;
    }

    if (to[0] < 0 || to[0] >= world.overworld.height || to[1] < 0 || to[1] >= world.overworld.width) {
      await interaction.reply({ content: 'Out of bounds.', ephemeral: true });
      return;
    }

    // Block stepping onto another entity's cell.
    const occupant = Object.entries(world.entities).find(
      ([eid, e]) => eid !== ctx.pcId && e.pos[0] === to[0] && e.pos[1] === to[1],
    );
    if (occupant) {
      await interaction.reply({ content: `That cell is occupied by \`${occupant[0]}\`.`, ephemeral: true });
      return;
    }

    const path = tracePath(world, ctx.pc.pos, to);
    if (!path) {
      await interaction.reply({ content: 'Path blocked by impassable terrain.', ephemeral: true });
      return;
    }

    // In an active encounter, enforce movement budget.
    if (world.encounter) {
      const turn = await requireActiveTurn(interaction, world);
      if (!turn) return;
      const budget = world.encounter.movementBudget[ctx.pcId] ?? ctx.sheet.speed;
      if (path.feetCost > budget) {
        await interaction.reply({
          content: `Not enough movement. ${path.feetCost} ft requested, ${budget} ft remaining.`,
          ephemeral: true,
        });
        return;
      }
    }

    const from = ctx.pc.pos;
    await updateWorld(interaction.guildId!, (w) => {
      const e = w.entities[ctx.pcId] as PcEntity;
      e.pos = to;
      if (w.encounter) {
        const budget = w.encounter.movementBudget[ctx.pcId] ?? ctx.sheet.speed;
        w.encounter.movementBudget[ctx.pcId] = budget - path.feetCost;
        logAction(w.encounter, ctx.pcId, `moved (${from[0]},${from[1]}) → (${to[0]},${to[1]}) (${path.feetCost} ft)`);
      }
    });

    const fresh = await loadWorld(interaction.guildId!);
    const zoneHere = fresh ? zoneAt(fresh, to[0], to[1]) : null;
    const where = zoneHere ? ` — entered **${zoneHere.zone.name}**` : '';
    const budgetLine = world.encounter
      ? ` Movement left: **${(world.encounter.movementBudget[ctx.pcId] ?? ctx.sheet.speed) - path.feetCost}/${ctx.sheet.speed} ft**.`
      : '';
    await interaction.reply(`🏃 Moved to (${to[0]},${to[1]}).${where}.${budgetLine}`);
  },
};

function describeEntity(world: World, id: string): string {
  const e = world.entities[id];
  if (!e) return id;
  if (e.kind === 'pc') {
    const sheet = world.characters[e.characterId];
    return sheet ? `${sheet.name} (PC)` : `${id} (PC)`;
  }
  return `${e.name} (${e.kind})`;
}

const LOOK_RADIUS = 12; // cells

export const look: Command = {
  data: new SlashCommandBuilder()
    .setName('look')
    .setDescription('Describe where you stand and what is nearby'),
  async execute(interaction) {
    const world = await requireWorld(interaction);
    if (!world) return;
    const ctx = await requirePc(interaction, world);
    if (!ctx) return;
    const [r, c] = ctx.pc.pos;
    const zone = zoneAt(world, r, c);
    const terrain = terrainAt(world, r, c);
    const terrainLabel = TERRAIN_LABEL[terrain] ?? terrain;

    const nearby = Object.entries(world.entities)
      .filter(([eid, e]) => eid !== ctx.pcId && chebyshev(ctx.pc.pos, e.pos) <= LOOK_RADIUS)
      .sort(([, a], [, b]) => chebyshev(ctx.pc.pos, a.pos) - chebyshev(ctx.pc.pos, b.pos))
      .map(([eid, e]) => {
        const d = chebyshev(ctx.pc.pos, e.pos) * 5;
        return `• \`${eid}\` — ${describeEntity(world, eid)} at (${e.pos[0]},${e.pos[1]}) — ${d} ft`;
      })
      .join('\n');

    const embed = new EmbedBuilder()
      .setTitle(`👁️ ${zone ? zone.zone.name : 'Wilderness'}`)
      .setColor(0x16a085)
      .setDescription(
        `You are at (${r},${c}) on **${terrainLabel}**.` +
          (zone?.zone.description ? `\n\n${zone.zone.description}` : ''),
      );
    if (nearby) embed.addFields({ name: `Visible within ${LOOK_RADIUS * 5} ft`, value: nearby });
    else embed.addFields({ name: 'Visible', value: '*Nothing of note nearby.*' });
    await interaction.reply({ embeds: [embed] });
  },
};

const TERRAIN_LABEL: Record<string, string> = {
  '.': 'open ground',
  '#': 'wall / building',
  '~': 'water',
  f: 'forest',
  '^': 'mountain',
  '=': 'road',
  '>': 'stairs down',
  '<': 'stairs up',
  '+': 'door',
};

function weaponFromEquipped(sheet: CharacterSheet): { profile: WeaponProfile; name: string } {
  const main = sheet.equipped.mainHand;
  const w = getWeapon(main);
  if (w && main) return { profile: w, name: main };
  return { profile: UNARMED, name: 'unarmed strike' };
}

function attackAbility(sheet: CharacterSheet, weapon: WeaponProfile): { ability: 'str' | 'dex'; mod: number } {
  let ability = weapon.ability;
  if (weapon.finesse) {
    const strMod = modifier(sheet.abilities.str);
    const dexMod = modifier(sheet.abilities.dex);
    ability = dexMod >= strMod ? 'dex' : 'str';
  }
  return { ability, mod: modifier(sheet.abilities[ability]) };
}

function rangeFt(weapon: WeaponProfile): number {
  if ('melee' in weapon.range) return weapon.range.melee;
  return weapon.range.normal;
}

function describeTarget(world: World, id: string): { hp: number; ac: number; name: string } | null {
  const e = world.entities[id];
  if (!e) return null;
  if (e.kind === 'monster') return { hp: e.hp.current, ac: e.ac, name: e.name };
  if (e.kind === 'pc') {
    const sheet = world.characters[e.characterId];
    if (!sheet) return null;
    return { hp: sheet.hp.current, ac: sheet.ac, name: sheet.name };
  }
  return null;
}

function applyDamage(world: World, targetId: string, dmg: number): void {
  const e = world.entities[targetId];
  if (!e) return;
  if (e.kind === 'monster') {
    e.hp.current = Math.max(0, e.hp.current - dmg);
    if (e.hp.current === 0 && !e.conditions.includes('unconscious')) e.conditions.push('unconscious');
  } else if (e.kind === 'pc') {
    const sheet = world.characters[e.characterId];
    if (!sheet) return;
    sheet.hp.current = Math.max(0, sheet.hp.current - dmg);
    if (sheet.hp.current === 0 && !sheet.conditions.includes('unconscious')) sheet.conditions.push('unconscious');
  }
}

function doubleDice(expr: string): string {
  return expr.replace(/(\d*)d(\d+)/gi, (_, c, s) => `${(c ? parseInt(c, 10) : 1) * 2}d${s}`);
}

export const attack: Command = {
  data: new SlashCommandBuilder()
    .setName('attack')
    .setDescription('Attack a target with your equipped weapon (uses your turn)')
    .addStringOption((o) => o.setName('target').setDescription('Target entity id').setRequired(true)),
  async execute(interaction) {
    const world = await requireWorld(interaction);
    if (!world) return;
    const ctx = await requireActiveTurn(interaction, world);
    if (!ctx) return;
    const targetId = interaction.options.getString('target', true);
    const target = world.entities[targetId];
    if (!target) {
      await interaction.reply({ content: `No such entity \`${targetId}\`.`, ephemeral: true });
      return;
    }
    const desc = describeTarget(world, targetId);
    if (!desc) {
      await interaction.reply({ content: 'Cannot attack that entity.', ephemeral: true });
      return;
    }

    const { profile, name: weaponName } = weaponFromEquipped(ctx.sheet);
    const distance = chebyshev(ctx.pc.pos, target.pos) * 5;
    const reach = rangeFt(profile);
    if (distance > reach) {
      await interaction.reply({ content: `Out of range. Target ${distance} ft, weapon reach ${reach} ft.`, ephemeral: true });
      return;
    }

    const { ability, mod: abilMod } = attackAbility(ctx.sheet, profile);
    const profBonus = ctx.sheet.proficiencyBonus;
    const toHitMod = abilMod + profBonus;
    const attackRoll = rollExpression(`1d20${toHitMod >= 0 ? '+' : ''}${toHitMod}`);
    const nat = attackRoll.rolls[0].values[0];
    const crit = nat === 20;
    const autoMiss = nat === 1;
    const hit = !autoMiss && (crit || attackRoll.total >= desc.ac);

    let damageLine = '';
    let dmgTotal = 0;
    if (hit) {
      const dmgExpr = crit
        ? `${doubleDice(profile.damageDice)}${abilMod >= 0 ? '+' : ''}${abilMod}`
        : `${profile.damageDice}${abilMod >= 0 ? '+' : ''}${abilMod}`;
      const dmgRoll = rollExpression(dmgExpr);
      dmgTotal = Math.max(0, dmgRoll.total);
      damageLine = `${crit ? '💥 CRIT! ' : ''}Damage: \`${dmgExpr}\` → ${dmgRoll.breakdown} = **${dmgTotal}** ${profile.damageType}`;
    }

    await updateWorld(interaction.guildId!, (w) => {
      if (hit && dmgTotal > 0) applyDamage(w, targetId, dmgTotal);
      logAction(
        w.encounter!,
        ctx.pcId,
        `attacked ${targetId} with ${weaponName}: ${hit ? `hit for ${dmgTotal}` : 'miss'}${crit ? ' (crit)' : ''}${autoMiss ? ' (nat 1)' : ''}`,
        [{ toHit: attackRoll.total, ac: desc.ac, dmg: dmgTotal }],
      );
    });

    const after = await loadWorld(interaction.guildId!);
    const afterDesc = after ? describeTarget(after, targetId) : null;
    const embed = new EmbedBuilder()
      .setTitle(`⚔️ ${ctx.sheet.name} attacks ${desc.name}`)
      .setColor(hit ? 0xc0392b : 0x7f8c8d)
      .addFields(
        { name: 'Weapon', value: `${weaponName} (${ability.toUpperCase()} ${abilMod >= 0 ? '+' : ''}${abilMod}, prof +${profBonus})`, inline: false },
        { name: 'Attack', value: `\`1d20${toHitMod >= 0 ? '+' : ''}${toHitMod}\` → ${attackRoll.breakdown} = **${attackRoll.total}** vs AC ${desc.ac}`, inline: false },
        { name: 'Result', value: autoMiss ? '💀 Nat 1 — miss.' : hit ? `✅ Hit!\n${damageLine}` : '❌ Miss.', inline: false },
      );
    if (afterDesc) embed.setFooter({ text: `${desc.name} HP: ${afterDesc.hp}` });
    await interaction.reply({ embeds: [embed] });
  },
};

export const use: Command = {
  data: new SlashCommandBuilder()
    .setName('use')
    .setDescription('Use an item from your inventory')
    .addStringOption((o) => o.setName('item').setDescription('Item name').setRequired(true)),
  async execute(interaction) {
    const world = await requireWorld(interaction);
    if (!world) return;
    const ctx = await requirePc(interaction, world);
    if (!ctx) return;
    const sheet = ctx.sheet;
    const itemName = interaction.options.getString('item', true).toLowerCase();
    const stack = sheet.inventory.find((i) => i.item === itemName);
    if (!stack || stack.qty < 1) {
      await interaction.reply({ content: `You don't have **${itemName}**.`, ephemeral: true });
      return;
    }

    let result = `Used **${itemName}**.`;
    if (itemName === 'potion-of-healing') {
      const heal = rollExpression('2d4+2');
      const before = sheet.hp.current;
      const after = Math.min(sheet.hp.max, before + heal.total);
      const gained = after - before;
      await updateWorld(interaction.guildId!, (w) => {
        const s = w.characters[interaction.user.id]!;
        s.hp.current = after;
        const idx = s.inventory.findIndex((i) => i.item === itemName);
        if (idx !== -1) {
          s.inventory[idx].qty -= 1;
          if (s.inventory[idx].qty <= 0) s.inventory.splice(idx, 1);
        }
        if (w.encounter) logAction(w.encounter, ctx.pcId, `used potion-of-healing: +${gained} HP`);
      });
      result = `🧪 Drank **potion-of-healing** — \`2d4+2\` → **${heal.total}** healed (${gained} applied). HP **${after}/${sheet.hp.max}**.`;
    } else {
      await updateWorld(interaction.guildId!, (w) => {
        const s = w.characters[interaction.user.id]!;
        const idx = s.inventory.findIndex((i) => i.item === itemName);
        if (idx !== -1) {
          s.inventory[idx].qty -= 1;
          if (s.inventory[idx].qty <= 0) s.inventory.splice(idx, 1);
        }
        if (w.encounter) logAction(w.encounter, ctx.pcId, `used ${itemName}`);
      });
    }
    await interaction.reply(result);
  },
};
