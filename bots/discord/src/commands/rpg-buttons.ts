import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  ModalSubmitInteraction,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { getOrCreateWorld, updateWorld } from '../rpg/world.ts';
import { makeCharacter } from './rpg.ts';
import {
  startDuel,
  declineDuel,
  isDuelExpired,
  runDuel,
  DuelRunResult,
} from '../rpg/duel.ts';
import {
  startTrade,
  adjustCoins,
  confirmSide,
  cancelTrade,
  executeTrade,
} from '../rpg/trade.ts';
import type { Character, Trade } from '../rpg/world.ts';
import {
  Screen,
  applyBagSelection,
  buildEmbed,
  buildRows,
  doBuy,
  doRerollBounty,
  doRest,
  doSell,
  doUnequip,
  doUseItem,
  hasPotion,
  nearbyPlayers,
  pushCombatLog,
} from '../rpg/locationui.ts';
import { getLocation, buildLocations } from '../rpg/locations.ts';
import { fightRound, fleeEncounter, startEncounter } from '../rpg/combat.ts';
import { rollExplore, rollTravelEncounter } from '../rpg/encounter.ts';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function handleRpgButton(
  interaction:
    | ButtonInteraction
    | StringSelectMenuInteraction
    | ModalSubmitInteraction,
): Promise<void> {
  const parts = interaction.customId.split(':');
  const domain = parts[1];

  if (domain === 'create') {
    await handleCreate(interaction, parts);
  } else if (domain === 'duel') {
    await handleDuelButton(interaction as ButtonInteraction, parts);
  } else if (domain === 'trade') {
    if (interaction.isStringSelectMenu()) {
      await handleTradeSelect(interaction, parts);
    } else {
      await handleTradeButton(interaction as ButtonInteraction, parts);
    }
  } else if (domain === 'ctl') {
    await handleControllerButton(
      interaction as ButtonInteraction | StringSelectMenuInteraction,
      parts,
    );
  }
}

// ── Character creation (start → modal → controller) ──────────────────────────

async function handleCreate(
  interaction:
    | ButtonInteraction
    | StringSelectMenuInteraction
    | ModalSubmitInteraction,
  parts: string[],
): Promise<void> {
  const action = parts[2];

  // Step 1: the "Create character" button opens a modal.
  if (action === 'open' && interaction.isButton()) {
    const modal = new ModalBuilder()
      .setCustomId('rpg:create:submit')
      .setTitle('Create your character');

    const nameInput = new TextInputBuilder()
      .setCustomId('name')
      .setLabel('Character name')
      .setStyle(TextInputStyle.Short)
      .setMaxLength(24)
      .setRequired(false)
      .setPlaceholder('Defaults to your Discord name');

    const glyphInput = new TextInputBuilder()
      .setCustomId('glyph')
      .setLabel('Emoji to represent you (optional)')
      .setStyle(TextInputStyle.Short)
      .setMaxLength(8)
      .setRequired(false)
      .setPlaceholder('e.g. 🧙 — leave blank to auto-pick');

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(glyphInput),
    );
    await interaction.showModal(modal);
    return;
  }

  // Step 2: modal submit creates the character and opens the controller.
  if (action === 'submit' && interaction.isModalSubmit()) {
    if (!interaction.inGuild()) {
      await interaction.reply({ content: 'Use this in a server.', ephemeral: true });
      return;
    }
    const guildId = interaction.guildId;
    const userId = interaction.user.id;
    const rawName = interaction.fields.getTextInputValue('name')?.trim();
    const rawGlyph = interaction.fields.getTextInputValue('glyph')?.trim();
    const name = rawName || interaction.user.username;
    const glyph = rawGlyph?.match(/\p{Extended_Pictographic}/u)?.[0] ?? null;

    const world = await updateWorld(guildId, (w) => {
      // Guard against double-submit / a character created in a race.
      if (w.chars[userId]) {
        w.chars[userId].away = false;
        return;
      }
      w.chars[userId] = makeCharacter(w, userId, name, glyph);
    }, { urgent: true });

    const char = world.chars[userId];
    const tip =
      '👋 Welcome! 🔍 Explore your surroundings to find foes and loot, 🏕️ Rest to heal, and travel between places with the buttons below. 🏪 Town (at the plaza) to shop.';
    const embed = buildEmbed(world, char, 'location', tip);
    const rows = buildRows(world, char, 'location');
    await interaction.reply({ embeds: [embed], components: rows, ephemeral: true });
    return;
  }
}

// ── Controller (button-driven movement / combat) ────────────────────────────

async function handleControllerButton(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
  parts: string[],
): Promise<void> {
  if (!interaction.inGuild()) {
    await interaction.reply({ content: 'Not in a guild.', ephemeral: true });
    return;
  }
  const action = parts[2];
  const guildId = interaction.guildId;
  const userId = interaction.user.id;

  if (action === 'exit') {
    await updateWorld(guildId, (w) => {
      const char = w.chars[userId];
      if (char) char.away = true;
    }, { urgent: true });
    await interaction.update({
      content: '🚪 You step away from the world. You are safe — mobs cannot reach you. Use `/rpg start` to return.',
      embeds: [],
      components: [],
    });
    return;
  }

  // Duel / trade from the Nearby screen: posts a public proposal in the channel,
  // then refreshes the (ephemeral) controller back to the Nearby screen.
  if (action === 'duel' || action === 'trade') {
    await handleSocialInitiation(interaction as ButtonInteraction, action, parts[3], guildId, userId);
    return;
  }

  let screen: Screen = 'location';
  let banner: string | undefined;
  let missing = false;

  const world = await updateWorld(guildId, (w) => {
    const char = w.chars[userId];
    if (!char) { missing = true; return; }
    char.away = false;

    // If mid-combat, stay on the combat screen by default.
    if (char.encounter) screen = 'combat';

    switch (action) {
      case 'screen':
        screen = (parts[3] as Screen) ?? 'location';
        break;

      // ── Location actions ──
      case 'explore': {
        const loc = getLocation(w, char.locationId);
        if (!loc) break;
        const ev = rollExplore(w, char, loc);
        if (ev.kind === 'combat') {
          screen = 'combat';
          banner = '⚔️ You run into a foe!';
        } else {
          banner = ev.text;
        }
        break;
      }
      case 'rest':
        banner = doRest(char).banner;
        break;
      case 'travel': {
        const destId = parts[3];
        const loc = getLocation(w, char.locationId);
        const dest = getLocation(w, destId);
        if (!dest || !loc || !loc.exits.includes(destId)) { banner = 'You cannot go there from here.'; break; }
        char.locationId = destId;
        // Travel risk: a wandering foe may intercept.
        const ambush = rollTravelEncounter(dest);
        if (ambush) {
          startEncounter(char, ambush);
          screen = 'combat';
          banner = `⚠️ On the road to ${dest.name}, you are ambushed!`;
        } else {
          banner = `🧭 You travel to ${dest.glyph} ${dest.name}.`;
        }
        break;
      }

      // ── Combat actions ──
      case 'fight': {
        if (!char.encounter) { screen = 'location'; break; }
        const r = fightRound(w, char);
        pushCombatLog(char, r.playerLog);
        if (r.mobLog) pushCombatLog(char, r.mobLog);
        if (r.kill) {
          const k = r.kill;
          const extra = k.leveledUp ? ` ✨ Level ${k.newLevel}!` : '';
          const bounty = k.bounty ? ` 🎯 Bounty complete! +${k.bounty.xp} XP, +${k.bounty.coins}c.` : '';
          banner = `☠️ Defeated! +${k.xp} XP, +${k.coins}c${k.drops.length ? `, dropped ${k.drops.join(', ')}` : ''}.${extra}${bounty}`;
          screen = 'location';
        } else if (r.died) {
          banner = '💀 You fell — carried back to the plaza, lighter of coin.';
          screen = 'location';
        } else {
          screen = 'combat';
        }
        break;
      }
      case 'flee': {
        const f = fleeEncounter(w, char);
        banner = f.log;
        screen = 'location';
        break;
      }
      case 'combatpotion': {
        banner = doUseItem(char, 'healing-potion').banner;
        screen = char.encounter ? 'combat' : 'location';
        break;
      }

      // ── Bag ──
      case 'bagsel': {
        screen = 'bag';
        banner = applyBagSelection(char, interaction.isStringSelectMenu() ? interaction.values[0] : '').banner;
        break;
      }
      case 'unequip':
        screen = 'bag';
        banner = doUnequip(char, parts[3] as 'weapon' | 'armor').banner;
        break;

      // ── Town ──
      case 'buysel':
        screen = 'town';
        banner = doBuy(char, interaction.isStringSelectMenu() ? interaction.values[0] : '').banner;
        break;
      case 'sellsel':
        screen = 'town';
        banner = doSell(char, interaction.isStringSelectMenu() ? interaction.values[0] : '').banner;
        break;

      // ── Sheet ──
      case 'bounty':
        screen = 'sheet';
        banner = doRerollBounty(char).banner;
        break;
    }
  }, { urgent: true });

  if (missing) {
    await interaction.reply({ content: 'You have not joined. Use `/rpg start` first.', ephemeral: true });
    return;
  }

  const char = world.chars[userId];
  if (!char) {
    await interaction.update({ content: 'Character not found.', embeds: [], components: [] });
    return;
  }

  await interaction.update({
    embeds: [buildEmbed(world, char, screen, banner)],
    components: buildRows(world, char, screen),
  });
}

// Initiate a duel or trade against a nearby player from the Nearby screen.
// Posts a public proposal in the channel and refreshes the ephemeral controller.
async function handleSocialInitiation(
  interaction: ButtonInteraction,
  kind: 'duel' | 'trade',
  targetId: string,
  guildId: string,
  userId: string,
): Promise<void> {
  const world = await getOrCreateWorld(guildId);
  const self = world.chars[userId];
  const target = world.chars[targetId];

  // Re-validate proximity at click time — the target may have wandered off.
  const refreshNearby = async (banner: string): Promise<void> => {
    const w = await getOrCreateWorld(guildId);
    const c = w.chars[userId];
    if (!c) {
      await interaction.update({ content: 'Character not found.', embeds: [], components: [] });
      return;
    }
    const embed = buildEmbed(w, c, 'nearby', banner);
    const rows = buildRows(w, c, 'nearby');
    await interaction.update({ embeds: [embed], components: rows });
  };

  if (!self || !target) {
    await refreshNearby('That adventurer is no longer here.');
    return;
  }
  if (!nearbyPlayers(world, self).some((p) => p.userId === targetId)) {
    await refreshNearby(`${target.glyph} ${target.name} moved out of reach.`);
    return;
  }

  // Acknowledge on the controller first, then post the public proposal so the
  // target (and onlookers) can see and respond to it in the channel.
  await refreshNearby(
    kind === 'duel'
      ? `⚔️ Challenge sent to ${target.glyph} ${target.name} — see the channel.`
      : `🤝 Trade proposed to ${target.glyph} ${target.name} — see the channel.`,
  );

  if (kind === 'duel') {
    await postDuelProposal(interaction, guildId, userId, targetId, self, target);
  } else {
    await postTradeProposal(interaction, guildId, userId, targetId);
  }
}

async function postDuelProposal(
  interaction: ButtonInteraction,
  guildId: string,
  challengerId: string,
  defenderId: string,
  challenger: Character,
  defender: Character,
): Promise<void> {
  const sent = await interaction.followUp({
    content: `⚔️ ${challenger.glyph} **${challenger.name}** challenges ${defender.glyph} **${defender.name}** to a duel!`,
    ephemeral: false,
  });

  let duelId = '';
  await updateWorld(guildId, (w) => {
    duelId = startDuel(w, challengerId, defenderId, sent.id, sent.channelId).id;
  });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`rpg:duel:accept:${duelId}`).setLabel('Accept').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`rpg:duel:decline:${duelId}`).setLabel('Decline').setStyle(ButtonStyle.Danger),
  );
  await sent.edit({
    content: `⚔️ ${challenger.glyph} **${challenger.name}** challenges ${defender.glyph} **${defender.name}** to a duel!\n<@${defenderId}> — do you accept? (expires in 60s)`,
    components: [row],
  });
}

async function postTradeProposal(
  interaction: ButtonInteraction,
  guildId: string,
  aId: string,
  bId: string,
): Promise<void> {
  const embed = new EmbedBuilder()
    .setColor(0xe67e22)
    .setTitle('🤝 Trade Proposal')
    .addFields(
      { name: `⏳ <@${aId}> offers`, value: 'Coins: 0\nItems: —', inline: true },
      { name: `⏳ <@${bId}> offers`, value: 'Coins: 0\nItems: —', inline: true },
    )
    .setFooter({ text: 'Both sides must confirm to execute. Any change resets confirmations.' });

  const sent = await interaction.followUp({ embeds: [embed], ephemeral: false });

  let tradeId = '';
  await updateWorld(guildId, (w) => {
    tradeId = startTrade(w, aId, bId, sent.id, sent.channelId).id;
  });

  const rows = [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`rpg:trade:coins:${tradeId}:a:10`).setLabel('A +10 coins').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`rpg:trade:coins:${tradeId}:a:-10`).setLabel('A -10 coins').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`rpg:trade:coins:${tradeId}:b:10`).setLabel('B +10 coins').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`rpg:trade:coins:${tradeId}:b:-10`).setLabel('B -10 coins').setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`rpg:trade:confirm:${tradeId}:a`).setLabel('✅ Confirm (A)').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`rpg:trade:confirm:${tradeId}:b`).setLabel('✅ Confirm (B)').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`rpg:trade:cancel:${tradeId}`).setLabel('❌ Cancel').setStyle(ButtonStyle.Danger),
    ),
  ];
  await sent.edit({ embeds: [embed], components: rows });
}

// ── Duel ────────────────────────────────────────────────────────────────────

async function handleDuelButton(
  interaction: ButtonInteraction,
  parts: string[],
): Promise<void> {
  const action = parts[2];
  const duelId = parts[3];

  if (!interaction.inGuild()) {
    await interaction.reply({ content: 'Not in a guild.', ephemeral: true });
    return;
  }

  const guildId = interaction.guildId;

  if (action === 'accept') {
    let canProceed = false;
    let duelLog: string[] = [];
    let challengerName = '';
    let defenderName = '';

    const worldBefore = await updateWorld(guildId, (w) => {
      const duel = w.duels[duelId];
      if (!duel) return;
      if (duel.state !== 'pending') return;
      if (isDuelExpired(duel)) {
        duel.state = 'finished';
        return;
      }
      if (interaction.user.id !== duel.defenderId) return;
      duel.state = 'active';
      canProceed = true;
    });

    if (!canProceed) {
      const duel = worldBefore.duels[duelId];
      if (!duel) {
        await interaction.reply({ content: 'Duel not found.', ephemeral: true });
      } else if (isDuelExpired(duel) || duel.state === 'finished') {
        await interaction.update({ content: '⏱️ The duel challenge has expired.', components: [] });
      } else if (interaction.user.id !== duel.defenderId) {
        await interaction.reply({ content: 'This challenge was not issued to you.', ephemeral: true });
      } else {
        await interaction.reply({ content: 'This duel cannot be accepted right now.', ephemeral: true });
      }
      return;
    }

    // Defer the update so we can edit repeatedly as the fight plays out.
    await interaction.deferUpdate();

    // Run the duel swing-by-swing, editing the message between swings.
    const worldWithChars = worldBefore;
    const duelData = worldWithChars.duels[duelId];
    if (!duelData) return;

    const charA = worldWithChars.chars[duelData.challengerId];
    const charB = worldWithChars.chars[duelData.defenderId];
    if (!charA || !charB) {
      await interaction.editReply({ content: 'One or both duelists have left the world.', components: [] });
      return;
    }

    challengerName = `${charA.glyph} ${charA.name}`;
    defenderName = `${charB.glyph} ${charB.name}`;

    await interaction.editReply({
      content: `⚔️ **${challengerName}** vs **${defenderName}** — duel starting!`,
      components: [],
    });

    // Run the combat and collect the log. The mutation happens inside updateWorld.
    let result: DuelRunResult | null = null;
    await updateWorld(guildId, (w) => {
      result = runDuel(w, duelId);
    });

    if (!result) {
      await interaction.editReply({ content: 'Duel could not be resolved.', components: [] });
      return;
    }

    const duelResult: DuelRunResult = result;
    duelLog = duelResult.log;
    const xpAwarded = duelResult.xpAwarded;
    const winnerId = duelResult.winnerId;
    const winnerName = winnerId === charA.userId ? challengerName : defenderName;
    const loserName = winnerId === charA.userId ? defenderName : challengerName;

    // Show the log incrementally with small pauses.
    for (let i = 0; i < duelLog.length; i++) {
      await sleep(1500);
      await interaction.editReply({
        content: `⚔️ **${challengerName}** vs **${defenderName}**\n\n${duelLog.slice(0, i + 1).map((l) => `> ${l}`).join('\n')}`,
        components: [],
      });
    }

    await sleep(1500);
    await interaction.editReply({
      content: `⚔️ **${challengerName}** vs **${defenderName}**\n\n${duelLog.map((l) => `> ${l}`).join('\n')}\n\n🏆 **${winnerName}** wins the duel! +${xpAwarded} XP. (${loserName} is unharmed.)`,
      components: [],
    });

  } else if (action === 'decline') {
    if (!interaction.inGuild()) return;

    let declined = false;
    let challengerMention = '';

    await updateWorld(guildId, (w) => {
      const duel = w.duels[duelId];
      if (!duel || duel.state !== 'pending') return;
      if (isDuelExpired(duel)) { duel.state = 'finished'; return; }
      if (interaction.user.id !== duel.defenderId && interaction.user.id !== duel.challengerId) return;
      declineDuel(w, duelId);
      declined = true;
      challengerMention = `<@${duel.challengerId}>`;
    });

    if (declined) {
      await interaction.update({ content: `🚫 The duel challenge from ${challengerMention} was declined.`, components: [] });
    } else {
      await interaction.reply({ content: 'Challenge no longer active.', ephemeral: true });
    }
  }
}

// ── Trade ────────────────────────────────────────────────────────────────────

function buildTradeEmbed(trade: Trade): EmbedBuilder {
  const aOffer = `Coins: ${trade.aOffer.coins}\nItems: ${trade.aOffer.items.length ? trade.aOffer.items.join(', ') : '—'}`;
  const bOffer = `Coins: ${trade.bOffer.coins}\nItems: ${trade.bOffer.items.length ? trade.bOffer.items.join(', ') : '—'}`;
  const aStatus = trade.aConfirmed ? '✅' : '⏳';
  const bStatus = trade.bConfirmed ? '✅' : '⏳';

  return new EmbedBuilder()
    .setColor(0xe67e22)
    .setTitle('🤝 Trade Proposal')
    .addFields(
      { name: `${aStatus} <@${trade.aId}> offers`, value: aOffer, inline: true },
      { name: `${bStatus} <@${trade.bId}> offers`, value: bOffer, inline: true },
    )
    .setFooter({ text: 'Both sides must confirm to execute. Any change resets confirmations.' });
}

function buildTradeComponents(
  trade: Trade,
  aItems: string[],
  bItems: string[],
): ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] = [];

  // Side A item select (only if A has inventory).
  if (aItems.length > 0) {
    const options = [...new Set(aItems)].slice(0, 25).map((item) => ({
      label: item,
      value: item,
      default: trade.aOffer.items.includes(item),
    }));
    rows.push(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`rpg:trade:item:${trade.id}:a`)
          .setPlaceholder('Toggle item in your offer (side A)')
          .addOptions(options)
          .setMinValues(0)
          .setMaxValues(options.length),
      ),
    );
  }

  // Side B item select.
  if (bItems.length > 0) {
    const options = [...new Set(bItems)].slice(0, 25).map((item) => ({
      label: item,
      value: item,
      default: trade.bOffer.items.includes(item),
    }));
    rows.push(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`rpg:trade:item:${trade.id}:b`)
          .setPlaceholder('Toggle item in your offer (side B)')
          .addOptions(options)
          .setMinValues(0)
          .setMaxValues(options.length),
      ),
    );
  }

  // Coin adjustment buttons for both sides, plus confirm/cancel.
  rows.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`rpg:trade:coins:${trade.id}:a:10`)
        .setLabel('A +10 coins')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`rpg:trade:coins:${trade.id}:a:-10`)
        .setLabel('A -10 coins')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`rpg:trade:coins:${trade.id}:b:10`)
        .setLabel('B +10 coins')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`rpg:trade:coins:${trade.id}:b:-10`)
        .setLabel('B -10 coins')
        .setStyle(ButtonStyle.Secondary),
    ),
  );

  rows.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`rpg:trade:confirm:${trade.id}:a`)
        .setLabel('✅ Confirm (A)')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`rpg:trade:confirm:${trade.id}:b`)
        .setLabel('✅ Confirm (B)')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`rpg:trade:cancel:${trade.id}`)
        .setLabel('❌ Cancel')
        .setStyle(ButtonStyle.Danger),
    ),
  );

  return rows;
}

async function handleTradeButton(
  interaction: ButtonInteraction,
  parts: string[],
): Promise<void> {
  const action = parts[2];
  const tradeId = parts[3];

  if (!interaction.inGuild()) {
    await interaction.reply({ content: 'Not in a guild.', ephemeral: true });
    return;
  }

  const guildId = interaction.guildId;

  if (action === 'coins') {
    const side = parts[4] as 'a' | 'b';
    const delta = parseInt(parts[5], 10);

    let errorMsg: string | null = null;
    let updatedWorld: Awaited<ReturnType<typeof updateWorld>> | null = null;

    updatedWorld = await updateWorld(guildId, (w) => {
      const trade = w.trades[tradeId];
      if (!trade || trade.state !== 'open') { errorMsg = 'Trade is no longer open.'; return; }
      const userId = side === 'a' ? trade.aId : trade.bId;
      if (interaction.user.id !== userId) { errorMsg = 'You can only adjust your own side.'; return; }
      if (!adjustCoins(trade, side, delta, w)) {
        errorMsg = delta > 0 ? 'Not enough coins.' : 'Cannot go below 0.';
      }
    });

    if (errorMsg) {
      await interaction.reply({ content: errorMsg, ephemeral: true });
      return;
    }

    const trade = updatedWorld!.trades[tradeId];
    const aChar = updatedWorld!.chars[trade.aId];
    const bChar = updatedWorld!.chars[trade.bId];
    const embed = buildTradeEmbed(trade);
    const components = buildTradeComponents(
      trade,
      aChar?.inventory ?? [],
      bChar?.inventory ?? [],
    );
    await interaction.update({ embeds: [embed], components });

  } else if (action === 'confirm') {
    const side = parts[4] as 'a' | 'b';

    let errorMsg: string | null = null;
    let completed = false;
    let completionMsg: string | null = null;
    let updatedWorld: Awaited<ReturnType<typeof updateWorld>> | null = null;

    updatedWorld = await updateWorld(guildId, (w) => {
      const trade = w.trades[tradeId];
      if (!trade || trade.state !== 'open') { errorMsg = 'Trade is no longer open.'; return; }
      const userId = side === 'a' ? trade.aId : trade.bId;
      if (interaction.user.id !== userId) { errorMsg = 'You can only confirm your own side.'; return; }
      confirmSide(trade, side);

      if (trade.aConfirmed && trade.bConfirmed) {
        const result = executeTrade(w, trade);
        if (result.ok) {
          completed = true;
        } else {
          completionMsg = result.reason ?? 'Trade failed.';
          trade.aConfirmed = false;
          trade.bConfirmed = false;
        }
      }
    });

    if (errorMsg) {
      await interaction.reply({ content: errorMsg, ephemeral: true });
      return;
    }

    const trade = updatedWorld!.trades[tradeId];

    if (completed) {
      await interaction.update({
        embeds: [
          new EmbedBuilder()
            .setColor(0x2ecc71)
            .setTitle('✅ Trade Complete')
            .setDescription(
              `<@${trade.aId}> and <@${trade.bId}> successfully exchanged their offers.`,
            ),
        ],
        components: [],
      });
    } else if (completionMsg) {
      await interaction.reply({ content: `Trade failed: ${completionMsg}`, ephemeral: true });
    } else {
      const aChar = updatedWorld!.chars[trade.aId];
      const bChar = updatedWorld!.chars[trade.bId];
      const embed = buildTradeEmbed(trade);
      const components = buildTradeComponents(
        trade,
        aChar?.inventory ?? [],
        bChar?.inventory ?? [],
      );
      await interaction.update({ embeds: [embed], components });
    }

  } else if (action === 'cancel') {
    let cancelled = false;
    let updatedWorld: Awaited<ReturnType<typeof updateWorld>> | null = null;

    updatedWorld = await updateWorld(guildId, (w) => {
      const trade = w.trades[tradeId];
      if (!trade || trade.state !== 'open') return;
      if (interaction.user.id !== trade.aId && interaction.user.id !== trade.bId) return;
      cancelTrade(trade);
      cancelled = true;
    });

    if (cancelled) {
      await interaction.update({
        embeds: [
          new EmbedBuilder()
            .setColor(0xe74c3c)
            .setTitle('❌ Trade Cancelled')
            .setDescription(`<@${interaction.user.id}> cancelled the trade.`),
        ],
        components: [],
      });
    } else {
      await interaction.reply({ content: 'Trade is no longer active.', ephemeral: true });
    }
  }
}

async function handleTradeSelect(
  interaction: StringSelectMenuInteraction,
  parts: string[],
): Promise<void> {
  const tradeId = parts[3];
  const side = parts[4] as 'a' | 'b';

  if (!interaction.inGuild()) {
    await interaction.reply({ content: 'Not in a guild.', ephemeral: true });
    return;
  }

  const guildId = interaction.guildId;
  const selectedItems = interaction.values;

  let errorMsg: string | null = null;
  let updatedWorld: Awaited<ReturnType<typeof updateWorld>> | null = null;

  updatedWorld = await updateWorld(guildId, (w) => {
    const trade = w.trades[tradeId];
    if (!trade || trade.state !== 'open') { errorMsg = 'Trade is no longer open.'; return; }
    const userId = side === 'a' ? trade.aId : trade.bId;
    if (interaction.user.id !== userId) { errorMsg = 'You can only adjust your own side.'; return; }

    const offer = side === 'a' ? trade.aOffer : trade.bOffer;
    const char = w.chars[userId];
    if (!char) { errorMsg = 'Character not found.'; return; }

    // Validate that selected items are actually owned.
    const inventory = [...char.inventory];
    for (const item of selectedItems) {
      const idx = inventory.indexOf(item);
      if (idx < 0) { errorMsg = `You don't have ${item} to offer.`; return; }
      inventory.splice(idx, 1);
    }

    offer.items = [...selectedItems];
    trade.aConfirmed = false;
    trade.bConfirmed = false;
  });

  if (errorMsg) {
    await interaction.reply({ content: errorMsg, ephemeral: true });
    return;
  }

  const trade = updatedWorld!.trades[tradeId];
  const aChar = updatedWorld!.chars[trade.aId];
  const bChar = updatedWorld!.chars[trade.bId];
  const embed = buildTradeEmbed(trade);
  const components = buildTradeComponents(
    trade,
    aChar?.inventory ?? [],
    bChar?.inventory ?? [],
  );
  await interaction.update({ embeds: [embed], components });
}
