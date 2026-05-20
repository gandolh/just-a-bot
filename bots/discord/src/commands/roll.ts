import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { IntentResult, rollExpression, rollIntent } from '../dnd/dice.ts';
import { Ability, CharacterSheet, loadWorld, modifier } from '../dnd/world.ts';
import { entityForUser } from '../dnd/encounter.ts';
import { getWeapon, UNARMED } from '../dnd/weapons.ts';
import type { Command } from './types.ts';

const ABILITY_CHOICES: { name: string; value: Ability }[] = [
  { name: 'STR', value: 'str' },
  { name: 'DEX', value: 'dex' },
  { name: 'CON', value: 'con' },
  { name: 'INT', value: 'int' },
  { name: 'WIS', value: 'wis' },
  { name: 'CHA', value: 'cha' },
];

const SKILL_ABILITY: Record<string, Ability> = {
  acrobatics: 'dex',
  'animal-handling': 'wis',
  arcana: 'int',
  athletics: 'str',
  deception: 'cha',
  history: 'int',
  insight: 'wis',
  intimidation: 'cha',
  investigation: 'int',
  medicine: 'wis',
  nature: 'int',
  perception: 'wis',
  performance: 'cha',
  persuasion: 'cha',
  religion: 'int',
  'sleight-of-hand': 'dex',
  stealth: 'dex',
  survival: 'wis',
};

function renderResult(r: IntentResult): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(`🎲 ${r.title}`)
    .setColor(0x9b59b6)
    .addFields(
      { name: 'Roll', value: `\`${r.expression}\` → ${r.result.breakdown}`, inline: false },
      { name: 'Total', value: `**${r.result.total}**`, inline: true },
    );
  if (r.extra) {
    embed.addFields({
      name: r.extra.title,
      value: `\`${r.extra.expression}\` → ${r.extra.result.breakdown}\nTotal: **${r.extra.result.total}**`,
    });
  }
  if (r.note) embed.setFooter({ text: r.note });
  return embed;
}

async function getSheet(
  guildId: string | null,
  userId: string,
): Promise<CharacterSheet | null> {
  if (!guildId) return null;
  const world = await loadWorld(guildId);
  return world?.characters[userId] ?? null;
}

export const roll: Command = {
  data: new SlashCommandBuilder()
    .setName('roll')
    .setDescription('Roll dice — bot reads your character sheet to pick the right dice')
    .addStringOption((opt) =>
      opt
        .setName('intent')
        .setDescription('What kind of roll?')
        .setRequired(true)
        .addChoices(
          { name: 'attack (uses equipped weapon)', value: 'attack' },
          { name: 'save (uses ability mod + prof if proficient)', value: 'save' },
          { name: 'check (ability or skill)', value: 'check' },
          { name: 'initiative', value: 'initiative' },
          { name: 'death save', value: 'death-save' },
          { name: 'advantage (2d20kh1)', value: 'advantage' },
          { name: 'disadvantage (2d20kl1)', value: 'disadvantage' },
          { name: 'custom (raw notation)', value: 'custom' },
        ),
    )
    .addStringOption((o) =>
      o
        .setName('ability')
        .setDescription('Ability for save or check')
        .setRequired(false)
        .addChoices(...ABILITY_CHOICES.map((c) => ({ name: c.name, value: c.value }))),
    )
    .addStringOption((o) =>
      o.setName('skill').setDescription('Skill for a check (e.g. perception)').setRequired(false),
    )
    .addStringOption((o) =>
      o.setName('notation').setDescription('Raw dice notation when intent=custom').setRequired(false),
    ),
  async execute(interaction) {
    const intent = interaction.options.getString('intent', true);
    const ability = interaction.options.getString('ability') as Ability | null;
    const skill = interaction.options.getString('skill')?.toLowerCase() ?? null;
    const notation = interaction.options.getString('notation');
    const sheet = await getSheet(interaction.guildId, interaction.user.id);

    try {
      if (intent === 'custom') {
        const expr = notation ?? '1d20';
        const result = rollExpression(expr);
        await interaction.reply({
          embeds: [renderResult({ title: 'Custom roll', expression: expr, result })],
        });
        return;
      }

      if (intent === 'attack') {
        if (!sheet) {
          await interaction.reply({
            content: 'No character sheet found. Run `/char create` first, or use `intent:custom`.',
            ephemeral: true,
          });
          return;
        }
        const main = sheet.equipped.mainHand;
        const weapon = getWeapon(main) ?? UNARMED;
        let abil: Ability = weapon.ability;
        if (weapon.finesse) {
          const sMod = modifier(sheet.abilities.str);
          const dMod = modifier(sheet.abilities.dex);
          abil = dMod >= sMod ? 'dex' : 'str';
        }
        const abilMod = modifier(sheet.abilities[abil]);
        const mod = abilMod + sheet.proficiencyBonus;
        const damageDice = `${weapon.damageDice}${abilMod >= 0 ? '+' : ''}${abilMod}`;
        const result = rollIntent({
          intent: 'attack',
          mod,
          label: main ?? 'unarmed strike',
          damageDice,
        });
        await interaction.reply({ embeds: [renderResult(result)] });
        return;
      }

      if (intent === 'save') {
        if (!ability) {
          await interaction.reply({ content: 'Pick an `ability` for a save.', ephemeral: true });
          return;
        }
        let mod = 0;
        if (sheet) {
          mod = modifier(sheet.abilities[ability]);
          if (sheet.proficiencies.savingThrows.includes(ability)) {
            mod += sheet.proficiencyBonus;
          }
        }
        const result = rollIntent({ intent: 'save', mod, label: ability });
        await interaction.reply({ embeds: [renderResult(result)] });
        return;
      }

      if (intent === 'check') {
        let mod = 0;
        let label = ability ?? skill ?? 'check';
        if (sheet) {
          if (skill) {
            const skillAbil = SKILL_ABILITY[skill];
            if (skillAbil) {
              mod = modifier(sheet.abilities[skillAbil]);
              if (sheet.proficiencies.skills.includes(skill)) mod += sheet.proficiencyBonus;
              label = `${skill} (${skillAbil.toUpperCase()})`;
            }
          } else if (ability) {
            mod = modifier(sheet.abilities[ability]);
            label = ability.toUpperCase();
          }
        }
        const result = rollIntent({ intent: 'check', mod, label });
        await interaction.reply({ embeds: [renderResult(result)] });
        return;
      }

      if (intent === 'initiative') {
        let mod = 0;
        if (sheet) mod = modifier(sheet.abilities.dex);
        // If currently in an encounter as the rolling user, no auto-insertion;
        // DMs add via /dm encounter start. This is just a reroll helper.
        const result = rollIntent({ intent: 'initiative', mod });
        await interaction.reply({ embeds: [renderResult(result)] });
        return;
      }

      if (intent === 'death-save') {
        await interaction.reply({ embeds: [renderResult(rollIntent({ intent: 'death-save' }))] });
        return;
      }

      if (intent === 'advantage' || intent === 'disadvantage') {
        let mod = 0;
        let label: string | undefined;
        if (sheet && ability) {
          mod = modifier(sheet.abilities[ability]);
          label = ability.toUpperCase();
        }
        const result = rollIntent({ intent, mod, label });
        await interaction.reply({ embeds: [renderResult(result)] });
        return;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await interaction.reply({ content: `Couldn't roll that: ${msg}`, ephemeral: true });
    }
  },
};

void entityForUser;
