import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { loadWorld, updateWorld, World } from '../dnd/world.ts';
import { advanceTurn, currentActor, entityForUser, logAction, speedOf } from '../dnd/encounter.ts';
import { runMonsterTurn } from '../dnd/ai.ts';
import type { Command } from './types.ts';

function describeEntity(world: World, id: string): string {
  const e = world.entities[id];
  if (!e) return id;
  if (e.kind === 'pc') {
    const sheet = world.characters[e.characterId];
    return sheet ? `**${sheet.name}** (PC)` : `${id} (PC)`;
  }
  if (e.kind === 'monster') return `**${e.name}** (monster)`;
  return `**${e.name}** (NPC)`;
}

export const init: Command = {
  data: new SlashCommandBuilder()
    .setName('init')
    .setDescription('Show the initiative order for the active encounter'),
  async execute(interaction) {
    if (!interaction.inCachedGuild()) {
      await interaction.reply({ content: 'Use this in a server.', ephemeral: true });
      return;
    }
    const world = await loadWorld(interaction.guildId!);
    if (!world?.encounter) {
      await interaction.reply({ content: 'No encounter is active.', ephemeral: true });
      return;
    }
    const enc = world.encounter;
    const lines = enc.order.map((o, i) => {
      const arrow = i === enc.turnIndex ? '➡️' : '  ';
      const desc = describeEntity(world, o.entityId);
      return `${arrow} **${o.initiative}** — ${desc} \`${o.entityId}\``;
    });
    const embed = new EmbedBuilder()
      .setTitle('⚔️ Initiative')
      .setColor(0xc0392b)
      .setDescription(lines.join('\n'))
      .setFooter({ text: `Round ${enc.round} • ${enc.label}` });
    await interaction.reply({ embeds: [embed] });
  },
};

const MAX_AI_CHAIN = 20;

function isAiTurn(world: World): { id: string; monsterName: string } | null {
  const enc = world.encounter;
  if (!enc) return null;
  const id = currentActor(enc);
  if (!id) return null;
  const e = world.entities[id];
  if (!e || e.kind !== 'monster' || !e.aiControlled) return null;
  return { id, monsterName: e.name };
}

interface AiSummary {
  embed: EmbedBuilder;
}

async function runAiChain(guildId: string): Promise<AiSummary[]> {
  const summaries: AiSummary[] = [];
  for (let i = 0; i < MAX_AI_CHAIN; i++) {
    const world = await loadWorld(guildId);
    if (!world) break;
    const ai = isAiTurn(world);
    if (!ai) break;

    let flavor = '';
    let lines: string[] = [];
    await updateWorld(guildId, (w) => {
      const report = runMonsterTurn(w, ai.id);
      flavor = report.flavor;
      lines = report.lines;
      logAction(w.encounter!, ai.id, 'AI ended turn');
      advanceTurn(w.encounter!);
      const next = currentActor(w.encounter!);
      if (next) w.encounter!.movementBudget[next] = speedOf(w, next);
    });

    const embed = new EmbedBuilder()
      .setTitle(`🤖 ${ai.monsterName}'s turn`)
      .setColor(0x8e44ad)
      .setDescription([flavor, '', ...lines].filter(Boolean).join('\n'));
    summaries.push({ embed });
  }
  return summaries;
}

export const endTurn: Command = {
  data: new SlashCommandBuilder()
    .setName('end-turn')
    .setDescription('End your current turn in the active encounter'),
  async execute(interaction) {
    if (!interaction.inCachedGuild()) {
      await interaction.reply({ content: 'Use this in a server.', ephemeral: true });
      return;
    }
    const guildId = interaction.guildId!;
    const world = await loadWorld(guildId);
    if (!world?.encounter) {
      await interaction.reply({ content: 'No encounter is active.', ephemeral: true });
      return;
    }
    const actorId = currentActor(world.encounter);
    if (!actorId) {
      await interaction.reply({ content: 'No active turn.', ephemeral: true });
      return;
    }
    const actor = world.entities[actorId];
    const isDmOverride = world.dmUserId === interaction.user.id;
    let allowed = isDmOverride;
    if (!allowed && actor?.kind === 'pc' && actor.characterId === interaction.user.id) {
      allowed = true;
    }
    if (!allowed) {
      const owner = entityForUser(world, interaction.user.id);
      await interaction.reply({
        content: owner
          ? `It's not your turn. Current actor: \`${actorId}\`.`
          : `Only the active actor or DM can end this turn.`,
        ephemeral: true,
      });
      return;
    }
    await updateWorld(guildId, (w) => {
      const enc = w.encounter!;
      logAction(enc, actorId, 'ended turn');
      advanceTurn(enc);
      const next = currentActor(enc);
      if (next) enc.movementBudget[next] = speedOf(w, next);
    });

    await interaction.deferReply();
    const aiSummaries = await runAiChain(guildId);

    const fresh = await loadWorld(guildId);
    const enc = fresh!.encounter;
    let footerEmbed: EmbedBuilder;
    if (!enc) {
      footerEmbed = new EmbedBuilder()
        .setTitle('🕊️ Encounter ended')
        .setColor(0x95a5a6);
    } else {
      const nextId = currentActor(enc);
      footerEmbed = new EmbedBuilder()
        .setTitle('🔁 Turn ended')
        .setColor(0xc0392b)
        .setDescription(`Now: ${nextId ? describeEntity(fresh!, nextId) + ` \`${nextId}\`` : '—'}`)
        .setFooter({ text: `Round ${enc.round} • ${enc.label}` });
    }

    const embeds = [...aiSummaries.map((s) => s.embed), footerEmbed].slice(0, 10);
    await interaction.editReply({ embeds });
  },
};
