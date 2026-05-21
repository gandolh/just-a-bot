import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import type { Command } from './types.ts';
import {
  Ability,
  ABILITIES,
  Campaign,
  Character,
  InitEntry,
  abilityMod,
  endCampaign,
  findCharacterByQuery,
  findMonster,
  fmtMod,
  loadCampaign,
  nextMonsterId,
  startCampaign,
  updateCampaign,
} from '../dnd/state.ts';
import {
  AdvMode,
  parseDice,
  rollD20Mod,
  rollExpr,
} from '../dnd/dice.ts';

const DM_COLOR = 0x8e44ad;
const NPC_COLOR = 0xc0392b;
const SCENE_COLOR = 0x1abc9c;
const PLAYER_COLOR = 0x3498db;
const ROLL_COLOR = 0xf1c40f;
const COMBAT_COLOR = 0xe67e22;
const SHEET_COLOR = 0x2ecc71;

const ABILITY_NAMES: Record<Ability, string> = {
  str: 'Strength',
  dex: 'Dexterity',
  con: 'Constitution',
  int: 'Intelligence',
  wis: 'Wisdom',
  cha: 'Charisma',
};

const MODE_CHOICES = [
  { name: 'normal', value: 'normal' },
  { name: 'advantage', value: 'adv' },
  { name: 'disadvantage', value: 'dis' },
] as const;

const ABILITY_CHOICES = ABILITIES.map((a) => ({ name: ABILITY_NAMES[a], value: a }));

const data = new SlashCommandBuilder()
  .setName('dnd')
  .setDescription('Play a D&D 5e-style campaign with a DM and players')
  // ── Setup ──────────────────────────────────────────────────────────────
  .addSubcommand((s) =>
    s.setName('setup').setDescription('Start a new campaign in this channel; you become the DM'),
  )
  .addSubcommand((s) => s.setName('end').setDescription('End the campaign (DM only)'))
  .addSubcommand((s) => s.setName('status').setDescription('Show the campaign state'))
  // ── Player: character ──────────────────────────────────────────────────
  .addSubcommand((s) =>
    s.setName('join').setDescription('Create your character')
      .addStringOption((o) => o.setName('name').setDescription('Character name').setRequired(true).setMaxLength(40))
      .addStringOption((o) => o.setName('class').setDescription('Class (Fighter, Wizard, …)').setRequired(true).setMaxLength(30))
      .addStringOption((o) => o.setName('race').setDescription('Race (Human, Elf, …)').setMaxLength(30))
      .addIntegerOption((o) => o.setName('hp').setDescription('Max HP (default 10)').setMinValue(1).setMaxValue(999))
      .addIntegerOption((o) => o.setName('ac').setDescription('Armor Class (default 12)').setMinValue(1).setMaxValue(40))
      .addIntegerOption((o) => o.setName('str').setDescription('Strength score (default 10)').setMinValue(1).setMaxValue(30))
      .addIntegerOption((o) => o.setName('dex').setDescription('Dexterity score (default 10)').setMinValue(1).setMaxValue(30))
      .addIntegerOption((o) => o.setName('con').setDescription('Constitution score (default 10)').setMinValue(1).setMaxValue(30))
      .addIntegerOption((o) => o.setName('int').setDescription('Intelligence score (default 10)').setMinValue(1).setMaxValue(30))
      .addIntegerOption((o) => o.setName('wis').setDescription('Wisdom score (default 10)').setMinValue(1).setMaxValue(30))
      .addIntegerOption((o) => o.setName('cha').setDescription('Charisma score (default 10)').setMinValue(1).setMaxValue(30)),
  )
  .addSubcommand((s) => s.setName('leave').setDescription('Remove your character from the campaign'))
  .addSubcommand((s) =>
    s.setName('sheet').setDescription('Show a character sheet')
      .addUserOption((o) => o.setName('player').setDescription('Whose sheet (default: yours)')),
  )
  .addSubcommand((s) =>
    s.setName('hp').setDescription('Adjust your HP (positive heals, negative damages)')
      .addIntegerOption((o) => o.setName('delta').setDescription('HP change, e.g. -7 or +4').setRequired(true)),
  )
  // ── Player: rolls + roleplay ───────────────────────────────────────────
  .addSubcommand((s) =>
    s.setName('roll').setDescription('Roll dice (e.g. 1d20+5, 2d6)')
      .addStringOption((o) => o.setName('expr').setDescription('Dice expression like 1d20+5').setRequired(true))
      .addStringOption((o) => o.setName('reason').setDescription('What is this for? (perception, attack, …)').setMaxLength(60))
      .addStringOption((o) => o.setName('mode').setDescription('Advantage / disadvantage').addChoices(...MODE_CHOICES)),
  )
  .addSubcommand((s) =>
    s.setName('check').setDescription('Roll an ability check (d20 + your ability mod)')
      .addStringOption((o) => o.setName('ability').setDescription('Which ability').setRequired(true).addChoices(...ABILITY_CHOICES))
      .addStringOption((o) => o.setName('mode').setDescription('Advantage / disadvantage').addChoices(...MODE_CHOICES))
      .addStringOption((o) => o.setName('skill').setDescription('Skill label (e.g. Stealth, Perception)').setMaxLength(40)),
  )
  .addSubcommand((s) =>
    s.setName('say').setDescription('Speak in character — bot posts your dialogue')
      .addStringOption((o) => o.setName('text').setDescription('What your character says').setRequired(true).setMaxLength(1500)),
  )
  // ── DM narration ───────────────────────────────────────────────────────
  .addSubcommand((s) =>
    s.setName('narrate').setDescription('[DM] Post narration as the storyteller')
      .addStringOption((o) => o.setName('text').setDescription('The narration').setRequired(true).setMaxLength(1800)),
  )
  .addSubcommand((s) =>
    s.setName('npc').setDescription('[DM] Speak as an NPC')
      .addStringOption((o) => o.setName('name').setDescription('NPC name').setRequired(true).setMaxLength(40))
      .addStringOption((o) => o.setName('text').setDescription('What the NPC says').setRequired(true).setMaxLength(1500)),
  )
  .addSubcommand((s) =>
    s.setName('scene').setDescription('[DM] Set the scene')
      .addStringOption((o) => o.setName('title').setDescription('Scene title').setRequired(true).setMaxLength(80))
      .addStringOption((o) => o.setName('description').setDescription('Scene description').setRequired(true).setMaxLength(1800)),
  )
  .addSubcommand((s) =>
    s.setName('whisper').setDescription('[DM] Send a private message to one player')
      .addUserOption((o) => o.setName('player').setDescription('Recipient').setRequired(true))
      .addStringOption((o) => o.setName('text').setDescription('Whispered text').setRequired(true).setMaxLength(1500)),
  )
  .addSubcommand((s) =>
    s.setName('dmroll').setDescription('[DM] Roll dice privately (only you see it)')
      .addStringOption((o) => o.setName('expr').setDescription('Dice expression like 1d20+3').setRequired(true))
      .addStringOption((o) => o.setName('reason').setDescription('Label').setMaxLength(60))
      .addStringOption((o) => o.setName('mode').setDescription('Advantage / disadvantage').addChoices(...MODE_CHOICES)),
  )
  // ── DM combat ──────────────────────────────────────────────────────────
  .addSubcommand((s) => s.setName('init').setDescription('[DM] Roll initiative for all players and monsters'))
  .addSubcommand((s) => s.setName('next').setDescription('[DM] Advance to the next turn in initiative'))
  .addSubcommand((s) => s.setName('endcombat').setDescription('[DM] End the current initiative order'))
  .addSubcommand((s) =>
    s.setName('monster').setDescription('[DM] Add a tracked monster to the encounter')
      .addStringOption((o) => o.setName('name').setDescription('Monster name').setRequired(true).setMaxLength(40))
      .addIntegerOption((o) => o.setName('hp').setDescription('Hit points').setRequired(true).setMinValue(1).setMaxValue(9999))
      .addIntegerOption((o) => o.setName('ac').setDescription('Armor class').setRequired(true).setMinValue(1).setMaxValue(40))
      .addIntegerOption((o) => o.setName('init').setDescription('Initiative bonus (default 0)').setMinValue(-10).setMaxValue(20)),
  )
  .addSubcommand((s) =>
    s.setName('damage').setDescription('[DM] Apply damage to a player or monster')
      .addStringOption((o) => o.setName('target').setDescription('Player name / @mention or monster id/name').setRequired(true))
      .addIntegerOption((o) => o.setName('amount').setDescription('Damage amount').setRequired(true).setMinValue(1).setMaxValue(999)),
  )
  .addSubcommand((s) =>
    s.setName('heal').setDescription('[DM] Heal a player or monster')
      .addStringOption((o) => o.setName('target').setDescription('Player name / @mention or monster id/name').setRequired(true))
      .addIntegerOption((o) => o.setName('amount').setDescription('Heal amount').setRequired(true).setMinValue(1).setMaxValue(999)),
  )
  .addSubcommand((s) =>
    s.setName('xp').setDescription('[DM] Award XP to every player')
      .addIntegerOption((o) => o.setName('amount').setDescription('XP to award').setRequired(true).setMinValue(1).setMaxValue(999999)),
  )
  .addSubcommand((s) =>
    s.setName('give').setDescription('[DM] Give an item to a player')
      .addUserOption((o) => o.setName('player').setDescription('Recipient').setRequired(true))
      .addStringOption((o) => o.setName('item').setDescription('Item name').setRequired(true).setMaxLength(60)),
  );

export const dnd: Command = {
  data,
  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inCachedGuild()) {
      await replyEphemeral(interaction, 'Use this in a server.');
      return;
    }
    const sub = interaction.options.getSubcommand();
    switch (sub) {
      case 'setup': return handleSetup(interaction);
      case 'end': return handleEnd(interaction);
      case 'status': return handleStatus(interaction);
      case 'join': return handleJoin(interaction);
      case 'leave': return handleLeave(interaction);
      case 'sheet': return handleSheet(interaction);
      case 'hp': return handleHp(interaction);
      case 'roll': return handleRoll(interaction, false);
      case 'check': return handleCheck(interaction);
      case 'say': return handleSay(interaction);
      case 'narrate': return handleNarrate(interaction);
      case 'npc': return handleNpc(interaction);
      case 'scene': return handleScene(interaction);
      case 'whisper': return handleWhisper(interaction);
      case 'dmroll': return handleRoll(interaction, true);
      case 'init': return handleInit(interaction);
      case 'next': return handleNext(interaction);
      case 'endcombat': return handleEndCombat(interaction);
      case 'monster': return handleMonster(interaction);
      case 'damage': return handleDamageOrHeal(interaction, 'damage');
      case 'heal': return handleDamageOrHeal(interaction, 'heal');
      case 'xp': return handleXp(interaction);
      case 'give': return handleGive(interaction);
    }
  },
};

// ── Helpers ────────────────────────────────────────────────────────────────

async function replyEphemeral(interaction: ChatInputCommandInteraction, content: string): Promise<void> {
  await interaction.reply({ content, flags: MessageFlags.Ephemeral });
}

async function requireCampaign(interaction: ChatInputCommandInteraction): Promise<Campaign | null> {
  const campaign = await loadCampaign(interaction.guildId!);
  if (!campaign) {
    await replyEphemeral(interaction, 'No active campaign. A DM must run `/dnd setup` first.');
    return null;
  }
  return campaign;
}

async function requireDm(interaction: ChatInputCommandInteraction): Promise<Campaign | null> {
  const campaign = await requireCampaign(interaction);
  if (!campaign) return null;
  if (campaign.dmId !== interaction.user.id) {
    await replyEphemeral(interaction, 'Only the DM can use that. Ask whoever ran `/dnd setup`.');
    return null;
  }
  return campaign;
}

function parseMode(interaction: ChatInputCommandInteraction): AdvMode {
  return (interaction.options.getString('mode') ?? 'normal') as AdvMode;
}

// Bot-as-storyteller messages: defer ephemerally, post via channel, then delete the placeholder.
// Makes the bot's embed appear without the "user used /dnd narrate" attribution.
async function postAsBot(
  interaction: ChatInputCommandInteraction,
  embed: EmbedBuilder,
): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const channel = interaction.channel;
  if (channel && channel.isSendable()) {
    await channel.send({ embeds: [embed] });
  }
  await interaction.deleteReply().catch(() => {});
}

// ── Setup ──────────────────────────────────────────────────────────────────

async function handleSetup(interaction: ChatInputCommandInteraction): Promise<void> {
  const existing = await loadCampaign(interaction.guildId!);
  if (existing) {
    await replyEphemeral(
      interaction,
      `A campaign is already running (DM: <@${existing.dmId}>). Run \`/dnd end\` to wipe it.`,
    );
    return;
  }
  const campaign = await startCampaign(interaction.guildId!, interaction.channelId!, interaction.user.id);
  const embed = new EmbedBuilder()
    .setColor(DM_COLOR)
    .setTitle('🎲 A new campaign begins')
    .setDescription(
      [
        `<@${campaign.dmId}> is your Dungeon Master.`,
        '',
        'Players: `/dnd join name:<character> class:<class>` to create a character.',
        'DM: `/dnd scene`, `/dnd narrate`, `/dnd npc`, `/dnd init`, `/dnd monster`, …',
        'Everyone: `/dnd roll 1d20+3` to roll dice.',
      ].join('\n'),
    );
  await interaction.reply({ embeds: [embed] });
}

async function handleEnd(interaction: ChatInputCommandInteraction): Promise<void> {
  const campaign = await requireDm(interaction);
  if (!campaign) return;
  await endCampaign(interaction.guildId!);
  const embed = new EmbedBuilder()
    .setColor(DM_COLOR)
    .setTitle('📜 The campaign ends')
    .setDescription(`Started ${campaign.startedAt.slice(0, 10)} • ${Object.keys(campaign.players).length} player(s). Stories survive in memory.`);
  await interaction.reply({ embeds: [embed] });
}

async function handleStatus(interaction: ChatInputCommandInteraction): Promise<void> {
  const campaign = await requireCampaign(interaction);
  if (!campaign) return;
  const players = Object.values(campaign.players);
  const monsters = Object.values(campaign.monsters);
  const lines: string[] = [
    `**DM:** <@${campaign.dmId}>`,
    `**Started:** ${campaign.startedAt.slice(0, 10)}`,
  ];
  if (campaign.scene) lines.push(`**Scene:** ${campaign.scene.title}`);
  lines.push('');
  lines.push(
    players.length
      ? '**Party:**\n' + players.map((p) => `• ${p.name} — ${p.race ? p.race + ' ' : ''}${p.klass} ${p.level} • HP ${p.hp}/${p.maxHp} • AC ${p.ac}`).join('\n')
      : '**Party:** _empty — players use `/dnd join`_',
  );
  if (monsters.length) {
    lines.push('');
    lines.push('**Monsters:**\n' + monsters.map((m) => `• \`${m.id}\` ${m.name} — HP ${m.hp}/${m.maxHp} • AC ${m.ac}`).join('\n'));
  }
  if (campaign.initiative) {
    lines.push('');
    lines.push(formatInitiative(campaign));
  }
  const embed = new EmbedBuilder().setColor(DM_COLOR).setTitle('Campaign status').setDescription(lines.join('\n'));
  await interaction.reply({ embeds: [embed] });
}

// ── Character ──────────────────────────────────────────────────────────────

async function handleJoin(interaction: ChatInputCommandInteraction): Promise<void> {
  const name = interaction.options.getString('name', true).trim();
  const klass = interaction.options.getString('class', true).trim();
  const race = (interaction.options.getString('race') ?? 'Human').trim();
  const maxHp = interaction.options.getInteger('hp') ?? 10;
  const ac = interaction.options.getInteger('ac') ?? 12;
  const abilities: Record<Ability, number> = {
    str: interaction.options.getInteger('str') ?? 10,
    dex: interaction.options.getInteger('dex') ?? 10,
    con: interaction.options.getInteger('con') ?? 10,
    int: interaction.options.getInteger('int') ?? 10,
    wis: interaction.options.getInteger('wis') ?? 10,
    cha: interaction.options.getInteger('cha') ?? 10,
  };

  let already = false;
  let dmJoining = false;
  const campaign = await updateCampaign(interaction.guildId!, (c) => {
    if (c.dmId === interaction.user.id) { dmJoining = true; return; }
    if (c.players[interaction.user.id]) { already = true; return; }
    c.players[interaction.user.id] = {
      userId: interaction.user.id,
      name, race, klass, level: 1,
      hp: maxHp, maxHp, ac,
      abilities,
      inventory: [],
      xp: 0,
      notes: '',
    };
  });

  if (!campaign) {
    await replyEphemeral(interaction, 'No active campaign. A DM must run `/dnd setup` first.');
    return;
  }
  if (dmJoining) {
    await replyEphemeral(interaction, 'The DM cannot also play a character. End the campaign and have someone else DM.');
    return;
  }
  if (already) {
    await replyEphemeral(interaction, 'You already have a character. Use `/dnd leave` first to start over.');
    return;
  }
  const char = campaign.players[interaction.user.id];
  if (!char) return;

  await interaction.reply({ embeds: [characterSheetEmbed(char, interaction.user.id)] });
}

async function handleLeave(interaction: ChatInputCommandInteraction): Promise<void> {
  const userId = interaction.user.id;
  let had = false;
  const campaign = await updateCampaign(interaction.guildId!, (c) => {
    if (c.players[userId]) { had = true; delete c.players[userId]; }
    if (c.initiative) {
      c.initiative.order = c.initiative.order.filter((e) => !(e.type === 'player' && e.refId === userId));
      if (c.initiative.order.length === 0) c.initiative = null;
      else if (c.initiative.turnIdx >= c.initiative.order.length) c.initiative.turnIdx = 0;
    }
  });
  if (!campaign) {
    await replyEphemeral(interaction, 'No active campaign.');
    return;
  }
  await replyEphemeral(interaction, had ? 'You left the campaign. Your character is gone.' : 'You did not have a character.');
}

async function handleSheet(interaction: ChatInputCommandInteraction): Promise<void> {
  const campaign = await requireCampaign(interaction);
  if (!campaign) return;
  const target = interaction.options.getUser('player') ?? interaction.user;
  const char = campaign.players[target.id];
  if (!char) {
    await replyEphemeral(interaction, target.id === interaction.user.id
      ? 'You have no character. Use `/dnd join`.'
      : `${target.username} has no character.`);
    return;
  }
  await interaction.reply({
    embeds: [characterSheetEmbed(char, target.id)],
    flags: target.id === interaction.user.id ? MessageFlags.Ephemeral : undefined,
  });
}

async function handleHp(interaction: ChatInputCommandInteraction): Promise<void> {
  const delta = interaction.options.getInteger('delta', true);
  const userId = interaction.user.id;
  let before = 0;
  let downed = false;
  let missing = false;
  const campaign = await updateCampaign(interaction.guildId!, (c) => {
    const char = c.players[userId];
    if (!char) { missing = true; return; }
    before = char.hp;
    char.hp = clamp(char.hp + delta, 0, char.maxHp);
    downed = before > 0 && char.hp === 0;
  });
  if (!campaign) { await replyEphemeral(interaction, 'No active campaign.'); return; }
  if (missing) { await replyEphemeral(interaction, 'You have no character. Use `/dnd join`.'); return; }
  const char = campaign.players[userId];
  if (!char) return;
  const sign = delta >= 0 ? '+' : '';
  const verb = delta >= 0 ? '🩹' : '🩸';
  const lines = [`${verb} **${char.name}** ${sign}${delta} HP — ${before} → ${char.hp}/${char.maxHp}`];
  if (downed) lines.push('💀 Down to 0 HP — making death saves!');
  const embed = new EmbedBuilder().setColor(delta >= 0 ? SHEET_COLOR : COMBAT_COLOR).setDescription(lines.join('\n'));
  await interaction.reply({ embeds: [embed] });
}

// ── Rolls + roleplay ───────────────────────────────────────────────────────

async function handleRoll(interaction: ChatInputCommandInteraction, hidden: boolean): Promise<void> {
  if (hidden) {
    const campaign = await requireDm(interaction);
    if (!campaign) return;
  }
  const exprText = interaction.options.getString('expr', true);
  const reason = interaction.options.getString('reason');
  const mode = parseMode(interaction);

  const parsed = parseDice(exprText);
  if (!parsed) {
    await replyEphemeral(interaction, 'I could not parse that. Try formats like `1d20+5`, `2d6`, `4d6-1`.');
    return;
  }
  const result = rollExpr(parsed, mode);
  const title = reason
    ? `${hidden ? '🔒 ' : '🎲 '}${interaction.user.username} rolls — ${reason}`
    : `${hidden ? '🔒 ' : '🎲 '}${interaction.user.username} rolls ${exprText}`;
  const embed = new EmbedBuilder()
    .setColor(hidden ? DM_COLOR : ROLL_COLOR)
    .setTitle(title)
    .setDescription(`\`${exprText}\` ${result.detail}`);
  if (hidden) {
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  } else {
    await interaction.reply({ embeds: [embed] });
  }
}

async function handleCheck(interaction: ChatInputCommandInteraction): Promise<void> {
  const campaign = await requireCampaign(interaction);
  if (!campaign) return;
  const ability = interaction.options.getString('ability', true) as Ability;
  const mode = parseMode(interaction);
  const skill = interaction.options.getString('skill');
  const char = campaign.players[interaction.user.id];
  if (!char) { await replyEphemeral(interaction, 'You have no character. Use `/dnd join`.'); return; }

  const mod = abilityMod(char.abilities[ability]);
  const result = rollD20Mod(mod, mode);
  const label = skill ? `${skill} (${ABILITY_NAMES[ability]})` : ABILITY_NAMES[ability];
  const embed = new EmbedBuilder()
    .setColor(ROLL_COLOR)
    .setTitle(`🎲 ${char.name} — ${label} check`)
    .setDescription(`\`1d20${fmtMod(mod)}\` ${result.detail}`);
  await interaction.reply({ embeds: [embed] });
}

async function handleSay(interaction: ChatInputCommandInteraction): Promise<void> {
  const text = interaction.options.getString('text', true);
  const campaign = await requireCampaign(interaction);
  if (!campaign) return;
  const char = campaign.players[interaction.user.id];
  if (!char) { await replyEphemeral(interaction, 'You have no character. Use `/dnd join`.'); return; }
  const embed = new EmbedBuilder()
    .setColor(PLAYER_COLOR)
    .setAuthor({ name: `${char.name} (${char.klass})` })
    .setDescription(`💬 "${text}"`);
  await postAsBot(interaction, embed);
}

// ── DM narration ───────────────────────────────────────────────────────────

async function handleNarrate(interaction: ChatInputCommandInteraction): Promise<void> {
  const campaign = await requireDm(interaction);
  if (!campaign) return;
  const text = interaction.options.getString('text', true);
  const embed = new EmbedBuilder()
    .setColor(DM_COLOR)
    .setAuthor({ name: 'Dungeon Master' })
    .setDescription(`*${text}*`);
  await postAsBot(interaction, embed);
}

async function handleNpc(interaction: ChatInputCommandInteraction): Promise<void> {
  const campaign = await requireDm(interaction);
  if (!campaign) return;
  const name = interaction.options.getString('name', true);
  const text = interaction.options.getString('text', true);
  const embed = new EmbedBuilder()
    .setColor(NPC_COLOR)
    .setAuthor({ name })
    .setDescription(`💬 "${text}"`);
  await postAsBot(interaction, embed);
}

async function handleScene(interaction: ChatInputCommandInteraction): Promise<void> {
  const campaign = await requireDm(interaction);
  if (!campaign) return;
  const title = interaction.options.getString('title', true);
  const description = interaction.options.getString('description', true);
  await updateCampaign(interaction.guildId!, (c) => {
    c.scene = { title, description, setAt: new Date().toISOString() };
  });
  const embed = new EmbedBuilder()
    .setColor(SCENE_COLOR)
    .setTitle(`🌄 ${title}`)
    .setDescription(description);
  await postAsBot(interaction, embed);
}

async function handleWhisper(interaction: ChatInputCommandInteraction): Promise<void> {
  const campaign = await requireDm(interaction);
  if (!campaign) return;
  const recipient = interaction.options.getUser('player', true);
  const text = interaction.options.getString('text', true);
  try {
    await recipient.send({
      embeds: [
        new EmbedBuilder()
          .setColor(DM_COLOR)
          .setAuthor({ name: 'Dungeon Master (whispers)' })
          .setDescription(`*${text}*`),
      ],
    });
    await replyEphemeral(interaction, `Whispered to ${recipient.username}.`);
  } catch {
    await replyEphemeral(interaction, `Could not DM ${recipient.username} — they may have DMs from server members disabled.`);
  }
}

// ── DM combat ──────────────────────────────────────────────────────────────

async function handleInit(interaction: ChatInputCommandInteraction): Promise<void> {
  const campaign = await requireDm(interaction);
  if (!campaign) return;
  const updated = await updateCampaign(interaction.guildId!, (c) => {
    const entries: InitEntry[] = [];
    for (const p of Object.values(c.players)) {
      const dexMod = abilityMod(p.abilities.dex);
      const roll = rollD20Mod(dexMod);
      entries.push({ refId: p.userId, name: p.name, init: roll.total, type: 'player' });
    }
    for (const m of Object.values(c.monsters)) {
      const roll = rollD20Mod(m.initBonus);
      entries.push({ refId: m.id, name: m.name, init: roll.total, type: 'monster' });
    }
    entries.sort((a, b) => b.init - a.init);
    c.initiative = { order: entries, turnIdx: 0, round: 1 };
  });
  if (!updated || !updated.initiative) return;
  if (updated.initiative.order.length === 0) {
    await replyEphemeral(interaction, 'No combatants. Add players (`/dnd join`) or monsters (`/dnd monster`) first.');
    return;
  }
  const embed = new EmbedBuilder()
    .setColor(COMBAT_COLOR)
    .setTitle('⚔️ Roll for initiative!')
    .setDescription(formatInitiative(updated));
  await interaction.reply({ embeds: [embed] });
}

async function handleNext(interaction: ChatInputCommandInteraction): Promise<void> {
  const campaign = await requireDm(interaction);
  if (!campaign) return;
  let none = false;
  const updated = await updateCampaign(interaction.guildId!, (c) => {
    if (!c.initiative || c.initiative.order.length === 0) { none = true; return; }
    c.initiative.turnIdx += 1;
    if (c.initiative.turnIdx >= c.initiative.order.length) {
      c.initiative.turnIdx = 0;
      c.initiative.round += 1;
    }
  });
  if (none) { await replyEphemeral(interaction, 'No initiative is running. Use `/dnd init` first.'); return; }
  if (!updated || !updated.initiative) return;
  const init = updated.initiative;
  const cur = init.order[init.turnIdx];
  const mention = cur.type === 'player' ? `<@${cur.refId}>` : `**${cur.name}**`;
  const embed = new EmbedBuilder()
    .setColor(COMBAT_COLOR)
    .setTitle(`⚔️ Round ${init.round} — ${cur.name}'s turn`)
    .setDescription(`${mention}, you're up.\n\n${formatInitiative(updated)}`);
  await interaction.reply({ embeds: [embed] });
}

async function handleEndCombat(interaction: ChatInputCommandInteraction): Promise<void> {
  const campaign = await requireDm(interaction);
  if (!campaign) return;
  let had = false;
  await updateCampaign(interaction.guildId!, (c) => {
    if (c.initiative) { had = true; c.initiative = null; }
  });
  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(COMBAT_COLOR)
        .setTitle(had ? '🕊️ Combat ends' : 'No combat to end')
        .setDescription(had ? 'Initiative order cleared. Catch your breath.' : 'Use `/dnd init` to start one.'),
    ],
  });
}

async function handleMonster(interaction: ChatInputCommandInteraction): Promise<void> {
  const campaign = await requireDm(interaction);
  if (!campaign) return;
  const name = interaction.options.getString('name', true);
  const hp = interaction.options.getInteger('hp', true);
  const ac = interaction.options.getInteger('ac', true);
  const initBonus = interaction.options.getInteger('init') ?? 0;
  let createdId = '';
  const updated = await updateCampaign(interaction.guildId!, (c) => {
    const id = nextMonsterId(c);
    c.monsters[id] = { id, name, hp, maxHp: hp, ac, initBonus };
    createdId = id;
  });
  if (!updated) return;
  const created = updated.monsters[createdId];
  if (!created) return;
  const embed = new EmbedBuilder()
    .setColor(NPC_COLOR)
    .setTitle(`👹 ${created.name} enters the fray`)
    .setDescription(`\`${created.id}\` • HP ${created.hp}/${created.maxHp} • AC ${created.ac} • init ${fmtMod(created.initBonus)}`);
  await interaction.reply({ embeds: [embed] });
}

async function handleDamageOrHeal(
  interaction: ChatInputCommandInteraction,
  mode: 'damage' | 'heal',
): Promise<void> {
  const campaign = await requireDm(interaction);
  if (!campaign) return;
  const target = interaction.options.getString('target', true);
  const amount = interaction.options.getInteger('amount', true);

  let notFound = false;
  let before = 0;
  let after = 0;
  let max = 0;
  let name = '';
  let cleared = false;
  let downed = false;

  await updateCampaign(interaction.guildId!, (c) => {
    const monster = findMonster(c, target);
    if (monster) {
      before = monster.hp;
      if (mode === 'damage') monster.hp = Math.max(0, monster.hp - amount);
      else monster.hp = Math.min(monster.maxHp, monster.hp + amount);
      after = monster.hp;
      max = monster.maxHp;
      name = monster.name;
      if (mode === 'damage' && monster.hp === 0) {
        delete c.monsters[monster.id];
        if (c.initiative) {
          c.initiative.order = c.initiative.order.filter((e) => !(e.type === 'monster' && e.refId === monster.id));
          if (c.initiative.order.length === 0) c.initiative = null;
          else if (c.initiative.turnIdx >= c.initiative.order.length) c.initiative.turnIdx = 0;
        }
        cleared = true;
      }
      return;
    }
    const char = findCharacterByQuery(c, target);
    if (!char) { notFound = true; return; }
    before = char.hp;
    if (mode === 'damage') char.hp = Math.max(0, char.hp - amount);
    else char.hp = Math.min(char.maxHp, char.hp + amount);
    after = char.hp;
    max = char.maxHp;
    name = char.name;
    downed = mode === 'damage' && before > 0 && char.hp === 0;
  });

  if (notFound) { await replyEphemeral(interaction, `Couldn't find a target named "${target}". Try a monster id (e.g. \`m1\`), a character name, or a @mention.`); return; }
  if (!name) return;
  const sign = mode === 'damage' ? '-' : '+';
  const emoji = mode === 'damage' ? '🩸' : '🩹';
  const lines = [`${emoji} **${name}** ${sign}${amount} HP — ${before} → ${after}/${max}`];
  if (cleared) lines.push('☠️ Slain and removed from the field.');
  else if (downed) lines.push('💀 Down to 0 HP!');
  const embed = new EmbedBuilder().setColor(mode === 'damage' ? COMBAT_COLOR : SHEET_COLOR).setDescription(lines.join('\n'));
  await interaction.reply({ embeds: [embed] });
}

async function handleXp(interaction: ChatInputCommandInteraction): Promise<void> {
  const campaign = await requireDm(interaction);
  if (!campaign) return;
  const amount = interaction.options.getInteger('amount', true);
  let recipients = 0;
  await updateCampaign(interaction.guildId!, (c) => {
    for (const p of Object.values(c.players)) {
      p.xp += amount;
      recipients++;
    }
  });
  if (recipients === 0) { await replyEphemeral(interaction, 'No players to award XP to.'); return; }
  const embed = new EmbedBuilder()
    .setColor(SHEET_COLOR)
    .setTitle('✨ XP awarded')
    .setDescription(`Each of the ${recipients} player(s) gained **${amount} XP**.`);
  await interaction.reply({ embeds: [embed] });
}

async function handleGive(interaction: ChatInputCommandInteraction): Promise<void> {
  const campaign = await requireDm(interaction);
  if (!campaign) return;
  const player = interaction.options.getUser('player', true);
  const item = interaction.options.getString('item', true).trim();
  let missing = false;
  let charName = '';
  await updateCampaign(interaction.guildId!, (c) => {
    const char = c.players[player.id];
    if (!char) { missing = true; return; }
    char.inventory.push(item);
    charName = char.name;
  });
  if (missing) { await replyEphemeral(interaction, `${player.username} has no character.`); return; }
  const embed = new EmbedBuilder()
    .setColor(SHEET_COLOR)
    .setTitle('🎁 A gift')
    .setDescription(`**${charName}** receives **${item}**.`);
  await interaction.reply({ embeds: [embed] });
}

// ── Rendering helpers ──────────────────────────────────────────────────────

function characterSheetEmbed(char: Character, userId: string): EmbedBuilder {
  const abilLines = ABILITIES.map((a) => {
    const score = char.abilities[a];
    return `**${ABILITY_NAMES[a].slice(0, 3).toUpperCase()}** ${score} (${fmtMod(abilityMod(score))})`;
  }).join(' • ');
  return new EmbedBuilder()
    .setColor(SHEET_COLOR)
    .setTitle(`📜 ${char.name}`)
    .setDescription(`<@${userId}> • ${char.race} ${char.klass} ${char.level} • ${char.xp} XP`)
    .addFields(
      { name: 'HP', value: `${char.hp}/${char.maxHp}`, inline: true },
      { name: 'AC', value: `${char.ac}`, inline: true },
      { name: 'Level', value: `${char.level}`, inline: true },
      { name: 'Abilities', value: abilLines },
      { name: 'Inventory', value: char.inventory.length ? char.inventory.join(', ') : '— empty —' },
    );
}

function formatInitiative(c: Campaign): string {
  if (!c.initiative) return '';
  return [
    `**Round ${c.initiative.round}**`,
    ...c.initiative.order.map((e, idx) => {
      const marker = idx === c.initiative!.turnIdx ? '👉' : '  ';
      const hpStr = hpForEntry(c, e);
      const mention = e.type === 'player' ? `<@${e.refId}>` : `\`${e.refId}\``;
      return `${marker} **${e.init}** — ${e.name} ${mention}${hpStr}`;
    }),
  ].join('\n');
}

function hpForEntry(c: Campaign, entry: { type: 'player' | 'monster'; refId: string }): string {
  if (entry.type === 'player') {
    const p = c.players[entry.refId];
    return p ? ` (HP ${p.hp}/${p.maxHp})` : '';
  }
  const m = c.monsters[entry.refId];
  return m ? ` (HP ${m.hp}/${m.maxHp})` : '';
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
