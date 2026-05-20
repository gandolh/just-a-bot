import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
} from 'discord.js';
import {
  CharacterSheet,
  loadWorld,
  modifier,
  PcEntity,
  updateWorld,
  World,
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

async function requireActiveTurn(
  interaction: ChatInputCommandInteraction,
  world: World,
): Promise<{ pcId: string; pc: PcEntity; sheet: CharacterSheet } | null> {
  if (!world.encounter) {
    await interaction.reply({ content: 'No encounter is active.', ephemeral: true });
    return null;
  }
  const owner = entityForUser(world, interaction.user.id);
  if (!owner || owner.entity.kind !== 'pc') {
    await interaction.reply({ content: 'You have no character placed in this world.', ephemeral: true });
    return null;
  }
  const actorId = currentActor(world.encounter);
  if (actorId !== owner.id) {
    await interaction.reply({ content: `It's not your turn. Current actor: \`${actorId}\`.`, ephemeral: true });
    return null;
  }
  const sheet = world.characters[owner.entity.characterId];
  if (!sheet) {
    await interaction.reply({ content: 'Your character sheet is missing.', ephemeral: true });
    return null;
  }
  return { pcId: owner.id, pc: owner.entity, sheet };
}

function chebyshev(a: [number, number], b: [number, number]): number {
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));
}

function pathClear(world: World, zoneId: string, from: [number, number], to: [number, number]): boolean {
  const zone = world.zones[zoneId];
  if (!zone) return false;
  const steps = chebyshev(from, to);
  if (steps === 0) return true;
  const dr = (to[0] - from[0]) / steps;
  const dc = (to[1] - from[1]) / steps;
  for (let i = 1; i <= steps; i++) {
    const r = Math.round(from[0] + dr * i);
    const c = Math.round(from[1] + dc * i);
    if (r < 0 || r >= zone.height || c < 0 || c >= zone.width) return false;
    const cell = zone.grid[r][c];
    if (cell === '#') return false;
  }
  return true;
}

export const move: Command = {
  data: new SlashCommandBuilder()
    .setName('move')
    .setDescription('Move your character to a target cell on the current zone')
    .addIntegerOption((o) => o.setName('row').setDescription('Target row').setMinValue(0).setRequired(true))
    .addIntegerOption((o) => o.setName('col').setDescription('Target column').setMinValue(0).setRequired(true)),
  async execute(interaction) {
    const world = await requireWorld(interaction);
    if (!world) return;
    const ctx = await requireActiveTurn(interaction, world);
    if (!ctx) return;
    const row = interaction.options.getInteger('row', true);
    const col = interaction.options.getInteger('col', true);
    const zone = world.zones[ctx.pc.zone];
    if (!zone || row >= zone.height || col >= zone.width) {
      await interaction.reply({ content: 'Out of bounds.', ephemeral: true });
      return;
    }
    if (!pathClear(world, ctx.pc.zone, ctx.pc.pos, [row, col])) {
      await interaction.reply({ content: 'Path blocked by a wall.', ephemeral: true });
      return;
    }
    const steps = chebyshev(ctx.pc.pos, [row, col]);
    const feet = steps * 5;
    const budget = world.encounter!.movementBudget[ctx.pcId] ?? ctx.sheet.speed;
    if (feet > budget) {
      await interaction.reply({
        content: `Not enough movement. ${feet} ft requested, ${budget} ft remaining.`,
        ephemeral: true,
      });
      return;
    }
    const from = ctx.pc.pos;
    await updateWorld(interaction.guildId!, (w) => {
      const e = w.entities[ctx.pcId] as PcEntity;
      e.pos = [row, col];
      const enc = w.encounter!;
      enc.movementBudget[ctx.pcId] = budget - feet;
      logAction(enc, ctx.pcId, `moved from [${from[0]},${from[1]}] to [${row},${col}] (${feet} ft)`);
    });
    await interaction.reply(`🏃 Moved to (${row},${col}). Movement left: **${budget - feet}/${ctx.sheet.speed} ft**.`);
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

export const look: Command = {
  data: new SlashCommandBuilder()
    .setName('look')
    .setDescription('Describe your current zone and visible entities'),
  async execute(interaction) {
    const world = await requireWorld(interaction);
    if (!world) return;
    const owner = entityForUser(world, interaction.user.id);
    if (!owner) {
      await interaction.reply({ content: 'You have no character placed yet.', ephemeral: true });
      return;
    }
    const zone = world.zones[owner.entity.zone];
    if (!zone) {
      await interaction.reply({ content: 'Your zone is missing.', ephemeral: true });
      return;
    }
    const overlay = zone.grid.map((row) => row.split(''));
    for (const [eid, e] of Object.entries(world.entities)) {
      if (e.zone !== owner.entity.zone) continue;
      const [r, c] = e.pos;
      if (r < 0 || r >= overlay.length || c < 0 || c >= overlay[r].length) continue;
      if (e.kind === 'pc') overlay[r][c] = (eid[0] ?? '?').toUpperCase();
      else if (e.kind === 'npc') overlay[r][c] = '@';
      else overlay[r][c] = (e.name[0] ?? '?').toLowerCase();
    }
    const rendered = overlay.map((r) => r.join('')).join('\n');
    const nearby = Object.entries(world.entities)
      .filter(([eid, e]) => e.zone === owner.entity.zone && eid !== owner.id)
      .map(([eid, e]) => `• \`${eid}\` — ${describeEntity(world, eid)} at (${e.pos[0]},${e.pos[1]})`)
      .join('\n');
    const embed = new EmbedBuilder()
      .setTitle(`👁️ ${zone.name}`)
      .setColor(0x16a085)
      .setDescription('```\n' + rendered + '\n```');
    if (zone.description) embed.addFields({ name: 'Description', value: zone.description });
    if (nearby) embed.addFields({ name: 'Entities', value: nearby });
    await interaction.reply({ embeds: [embed] });
  },
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
    if (target.zone !== ctx.pc.zone) {
      await interaction.reply({ content: 'Target is not in your zone.', ephemeral: true });
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
      const dmgExpr = crit ? `${doubleDice(profile.damageDice)}${abilMod >= 0 ? '+' : ''}${abilMod}` : `${profile.damageDice}${abilMod >= 0 ? '+' : ''}${abilMod}`;
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
    const owner = entityForUser(world, interaction.user.id);
    if (!owner) {
      await interaction.reply({ content: 'You have no character.', ephemeral: true });
      return;
    }
    const sheet = world.characters[interaction.user.id];
    if (!sheet) {
      await interaction.reply({ content: 'No sheet.', ephemeral: true });
      return;
    }
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
        if (w.encounter) logAction(w.encounter, owner.id, `used potion-of-healing: +${gained} HP`);
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
        if (w.encounter) logAction(w.encounter, owner.id, `used ${itemName}`);
      });
    }
    await interaction.reply(result);
  },
};

