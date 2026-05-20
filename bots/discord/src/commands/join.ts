import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { applyTemplate, TEMPLATES, TemplateKey } from '../dnd/templates.ts';
import { loadWorld, PcEntity, updateWorld } from '../dnd/world.ts';
import { entityForUser, rollInitiative, speedOf } from '../dnd/encounter.ts';
import type { Command } from './types.ts';

export const join: Command = {
  data: new SlashCommandBuilder()
    .setName('join')
    .setDescription('Join the adventure — creates a character if needed and places you in the world')
    .addStringOption((o) =>
      o
        .setName('template')
        .setDescription('Starter class (only used if you have no character yet)')
        .addChoices(
          { name: 'Fighter', value: 'fighter' },
          { name: 'Wizard', value: 'wizard' },
          { name: 'Rogue', value: 'rogue' },
          { name: 'Cleric', value: 'cleric' },
        ),
    )
    .addStringOption((o) => o.setName('name').setDescription('Character name (required for new characters)'))
    .addStringOption((o) => o.setName('race').setDescription('Race (default: human)')),
  async execute(interaction) {
    if (!interaction.inCachedGuild()) {
      await interaction.reply({ content: 'Use this in a server.', ephemeral: true });
      return;
    }
    const guildId = interaction.guildId!;
    const userId = interaction.user.id;
    const world = await loadWorld(guildId);
    if (!world) {
      await interaction.reply({
        content: 'No world exists in this server yet. The DM should run `/dm world init` first.',
        ephemeral: true,
      });
      return;
    }

    const zoneIds = Object.keys(world.zones);
    if (zoneIds.length === 0) {
      await interaction.reply({
        content: 'The world has no zones yet. The DM should create at least one with `/dm zone create`.',
        ephemeral: true,
      });
      return;
    }
    const firstZone = zoneIds[0];

    const lines: string[] = [];
    let createdCharacter = false;
    let placed = false;

    if (!world.characters[userId]) {
      const template = interaction.options.getString('template') as TemplateKey | null;
      const name = interaction.options.getString('name');
      const race = interaction.options.getString('race') ?? 'human';
      if (!template || !name) {
        await interaction.reply({
          content:
            'You have no character yet. Pick `template` and `name` to roll one up.\n' +
            'Example: `/join template:fighter name:Thorin race:dwarf`',
          ephemeral: true,
        });
        return;
      }
      const t = TEMPLATES[template];
      const sheet = applyTemplate(name, race, t);
      await updateWorld(guildId, (w) => {
        w.characters[userId] = sheet;
      });
      createdCharacter = true;
      lines.push(`🛡️ Created **${sheet.name}** — Level 1 ${sheet.race} ${sheet.class}.`);
    }

    const existingEntity = entityForUser(world, userId);
    if (!existingEntity) {
      // First time joining the map — spawn at (0,0) of the first zone.
      const eid = `pc-${userId}`;
      await updateWorld(guildId, (w) => {
        w.entities[eid] = {
          kind: 'pc',
          characterId: userId,
          zone: firstZone,
          pos: [0, 0],
        } satisfies PcEntity;
      });
      lines.push(`📍 Placed at \`${firstZone}\` (0,0).`);
      placed = true;
    } else {
      lines.push(`📍 Resumed at \`${existingEntity.entity.zone}\` (${existingEntity.entity.pos[0]},${existingEntity.entity.pos[1]}).`);
    }

    // If encounter active, insert at end of current round.
    let initiative: number | null = null;
    let alreadyInOrder = false;
    if (world.encounter) {
      const eid = `pc-${userId}`;
      const already = world.encounter.order.find((o) => o.entityId === eid);
      if (already) {
        alreadyInOrder = true;
        initiative = already.initiative;
        lines.push(`⚔️ You're already in the initiative order (rolled **${already.initiative}**).`);
      } else {
        // Need a freshly-loaded world reference for rollInitiative since updates above.
        const fresh = await loadWorld(guildId);
        initiative = rollInitiative(fresh!, eid);
        await updateWorld(guildId, (w) => {
          if (!w.encounter) return;
          w.encounter.order.push({ entityId: eid, initiative: initiative! });
          w.encounter.movementBudget[eid] = speedOf(w, eid);
          w.encounter.log.push({
            round: w.encounter.round,
            actor: eid,
            action: `joined the encounter (init ${initiative})`,
            rolls: [],
          });
        });
        lines.push(`⚔️ Joined active encounter — initiative **${initiative}**, you act at end of round ${world.encounter.round}.`);
      }
    }

    const embed = new EmbedBuilder()
      .setTitle(`👋 ${interaction.user.username} joined ${world.name}`)
      .setColor(0x27ae60)
      .setDescription(lines.join('\n'));
    if (createdCharacter) embed.setFooter({ text: 'Tip: /char show to see your sheet, /char inv to manage gear.' });
    await interaction.reply({ embeds: [embed] });
    void placed;
    void alreadyInOrder;
  },
};

export const leave: Command = {
  data: new SlashCommandBuilder()
    .setName('leave')
    .setDescription('Leave the adventure (removes you from the encounter; keeps your character & position)'),
  async execute(interaction) {
    if (!interaction.inCachedGuild()) {
      await interaction.reply({ content: 'Use this in a server.', ephemeral: true });
      return;
    }
    const guildId = interaction.guildId!;
    const userId = interaction.user.id;
    const world = await loadWorld(guildId);
    if (!world) {
      await interaction.reply({ content: 'No world here.', ephemeral: true });
      return;
    }
    const owner = entityForUser(world, userId);
    if (!owner) {
      await interaction.reply({ content: "You're not in the world.", ephemeral: true });
      return;
    }
    const lines: string[] = [];
    let removedFromEncounter = false;
    let endedEncounter = false;
    await updateWorld(guildId, (w) => {
      if (w.encounter) {
        const idx = w.encounter.order.findIndex((o) => o.entityId === owner.id);
        if (idx !== -1) {
          // Adjust turnIndex if we removed an earlier entry or the active one.
          if (idx < w.encounter.turnIndex) w.encounter.turnIndex--;
          else if (idx === w.encounter.turnIndex && w.encounter.turnIndex >= w.encounter.order.length - 1) {
            // Active actor leaving and is last in order — wrap.
            w.encounter.turnIndex = 0;
            w.encounter.round++;
          }
          w.encounter.order.splice(idx, 1);
          delete w.encounter.movementBudget[owner.id];
          removedFromEncounter = true;
          w.encounter.log.push({
            round: w.encounter.round,
            actor: owner.id,
            action: 'left the encounter',
            rolls: [],
          });
          if (w.encounter.order.length === 0) {
            w.encounter = null;
            endedEncounter = true;
          }
        }
      }
    });
    if (removedFromEncounter) {
      lines.push('⚔️ Removed from the initiative order.');
      if (endedEncounter) lines.push('🕊️ Encounter ended (no combatants remain).');
    }
    lines.push('Your character and position are saved. `/join` to resume later.');
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle('👋 You left the adventure').setColor(0x95a5a6).setDescription(lines.join('\n'))] });
  },
};
