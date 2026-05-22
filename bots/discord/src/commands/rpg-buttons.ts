import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
} from 'discord.js';
import { updateWorld } from '../rpg/world.ts';
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
import type { Trade } from '../rpg/world.ts';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function handleRpgButton(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
): Promise<void> {
  const parts = interaction.customId.split(':');
  const domain = parts[1];

  if (domain === 'duel') {
    await handleDuelButton(interaction as ButtonInteraction, parts);
  } else if (domain === 'trade') {
    if (interaction.isStringSelectMenu()) {
      await handleTradeSelect(interaction, parts);
    } else {
      await handleTradeButton(interaction as ButtonInteraction, parts);
    }
  }
}

// ── Duel ────────────────────────────────────────────────────────────────────

async function handleDuelButton(
  interaction: ButtonInteraction,
  parts: string[],
): Promise<void> {
  const action = parts[2];
  const duelId = parts[3];

  if (!interaction.inCachedGuild()) {
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
    if (!interaction.inCachedGuild()) return;

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

  if (!interaction.inCachedGuild()) {
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

  if (!interaction.inCachedGuild()) {
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

// ── Public factory helpers used by rpg.ts ────────────────────────────────────

export { startDuel, startTrade };
