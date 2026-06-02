import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from 'discord.js';
import { renderPair, rollPair } from '../gambling/dice.ts';
import { credit, getBalance, tryDebit } from '../gambling/wallet.ts';
import type { Command } from './types.ts';

interface Duel {
  bet: number;
  challengerId: string;
  challengerName: string;
  opponentId: string;
  opponentName: string;
}

const duels = new Map<string, Duel>();

function lobbyButtons(): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('dice2:roll')
        .setLabel('Accept & roll')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('dice2:decline')
        .setLabel('Decline')
        .setStyle(ButtonStyle.Danger),
    ),
  ];
}

export async function handleDice2Button(interaction: ButtonInteraction): Promise<void> {
  const duel = duels.get(interaction.message.id);
  if (!duel) {
    await interaction.reply({ content: 'This duel has expired.', ephemeral: true });
    return;
  }
  if (interaction.user.id !== duel.opponentId) {
    await interaction.reply({ content: 'This invite is for someone else.', ephemeral: true });
    return;
  }

  const action = interaction.customId.split(':')[1];

  if (action === 'decline') {
    await credit(duel.challengerId, duel.bet); // refund challenger's ante
    duels.delete(interaction.message.id);
    await interaction.update({
      content: `<@${duel.opponentId}> declined the dice duel. Ante refunded.`,
      components: [],
    });
    return;
  }

  if (action !== 'roll') return;

  // Opponent antes on accept.
  const ok = await tryDebit(duel.opponentId, duel.bet);
  if (!ok) {
    const bal = await getBalance(duel.opponentId);
    await interaction.reply({
      content: `Not enough coins. You have **${bal.toLocaleString()}**, need **${duel.bet.toLocaleString()}**.`,
      ephemeral: true,
    });
    return;
  }

  duels.delete(interaction.message.id);

  const a = rollPair();
  const b = rollPair();
  const pot = duel.bet * 2;

  let result: string;
  if (a.total > b.total) {
    await credit(duel.challengerId, pot); // winner takes both antes
    result = `**${duel.challengerName}** wins the pot of **${pot.toLocaleString()}**! 🎉`;
  } else if (b.total > a.total) {
    await credit(duel.opponentId, pot);
    result = `**${duel.opponentName}** wins the pot of **${pot.toLocaleString()}**! 🎉`;
  } else {
    await credit(duel.challengerId, duel.bet); // tie — both antes refunded
    await credit(duel.opponentId, duel.bet);
    result = `Tie at **${a.total}** — antes refunded.`;
  }

  await interaction.update({
    content: [
      `🎲 **Dice Duel** — 2d6 • bet each: **${duel.bet.toLocaleString()}**`,
      `${duel.challengerName}:  ${renderPair(a.dice)}  = **${a.total}**`,
      `${duel.opponentName}:  ${renderPair(b.dice)}  = **${b.total}**`,
      '',
      result,
    ].join('\n'),
    components: [],
  });
}

export const dice2: Command = {
  data: new SlashCommandBuilder()
    .setName('dice2')
    .setDescription('Challenge another player to a dice duel — biggest 2d6 takes the pot')
    .addUserOption((opt) =>
      opt.setName('opponent').setDescription('Who to challenge').setRequired(true),
    )
    .addIntegerOption((opt) =>
      opt.setName('bet').setDescription('Coins each player wagers').setRequired(true).setMinValue(1),
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    const opponent = interaction.options.getUser('opponent', true);
    const bet = interaction.options.getInteger('bet', true);
    const challengerId = interaction.user.id;

    if (opponent.bot) {
      await interaction.reply({ content: 'You can only challenge a real player.', ephemeral: true });
      return;
    }
    if (opponent.id === challengerId) {
      await interaction.reply({ content: 'You can not challenge yourself.', ephemeral: true });
      return;
    }

    // Challenger antes up front; opponent antes on accept.
    const ok = await tryDebit(challengerId, bet);
    if (!ok) {
      const balance = await getBalance(challengerId);
      await interaction.reply({
        content: `Not enough coins. You have **${balance.toLocaleString()}**, tried to bet **${bet.toLocaleString()}**.`,
        ephemeral: true,
      });
      return;
    }

    const duel: Duel = {
      bet,
      challengerId,
      challengerName: interaction.user.username,
      opponentId: opponent.id,
      opponentName: opponent.username,
    };

    const reply = await interaction.reply({
      content: [
        `🎲 **Dice Duel** — 2d6 • bet each: **${bet.toLocaleString()}**`,
        '',
        `<@${challengerId}> challenged <@${opponent.id}>.`,
        `<@${opponent.id}>, accept to ante **${bet.toLocaleString()}** coins and roll.`,
      ].join('\n'),
      components: lobbyButtons(),
      withResponse: true,
    });

    const messageId = reply.resource?.message?.id;
    if (messageId) duels.set(messageId, duel);
  },
};
