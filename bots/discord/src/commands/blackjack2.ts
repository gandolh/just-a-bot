import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from 'discord.js';
import {
  type Card,
  dealerPlay,
  freshDeck,
  handValue,
  isBlackjack,
  renderHand,
  settleHand,
} from '../gambling/blackjack.ts';
import { credit, getBalance, tryDebit } from '../gambling/wallet.ts';
import type { Command } from './types.ts';

interface Seat {
  userId: string;
  name: string;
  hand: Card[];
  doubled: boolean;
  done: boolean; // stood or busted
}

interface Table {
  bet: number;
  deck: Card[];
  dealer: Card[];
  seats: Seat[];
  turn: number; // index into seats whose turn it is
  started: boolean; // both players accepted
  finished: boolean;
  challengerId: string; // user who issued the command
  opponentId: string; // user who was challenged
  results?: string; // final settlement summary
}

const tables = new Map<string, Table>();

function rows(table: Table): ActionRowBuilder<ButtonBuilder>[] {
  if (!table.started) {
    return [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('bj2:join')
          .setLabel('Accept & ante')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('bj2:decline')
          .setLabel('Decline')
          .setStyle(ButtonStyle.Danger),
      ),
    ];
  }
  const seat = table.seats[table.turn];
  const canDouble = !!seat && seat.hand.length === 2 && !seat.doubled;
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('bj2:hit')
        .setLabel('Hit')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(table.finished),
      new ButtonBuilder()
        .setCustomId('bj2:stand')
        .setLabel('Stand')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(table.finished),
      new ButtonBuilder()
        .setCustomId('bj2:double')
        .setLabel('Double')
        .setStyle(ButtonStyle.Success)
        .setDisabled(table.finished || !canDouble),
    ),
  ];
}

function view(table: Table): { content: string; components: ActionRowBuilder<ButtonBuilder>[] } {
  const lines: string[] = [`**Blackjack (2P)** — bet each: **${table.bet.toLocaleString()}**`];

  if (!table.started) {
    lines.push(
      '',
      `<@${table.challengerId}> challenged <@${table.opponentId}>.`,
      `<@${table.opponentId}>, accept to ante **${table.bet.toLocaleString()}** coins and deal.`,
    );
    return { content: lines.join('\n'), components: rows(table) };
  }

  const dealerVal = table.finished ? handValue(table.dealer).total : '?';
  lines.push(`Dealer: ${renderHand(table.dealer, !table.finished)}  (${dealerVal})`);
  lines.push('');

  for (let i = 0; i < table.seats.length; i++) {
    const s = table.seats[i];
    const v = handValue(s.hand);
    const marker = !table.finished && i === table.turn ? '▶ ' : '  ';
    const doubled = s.doubled ? ' (doubled)' : '';
    lines.push(
      `${marker}**${s.name}**${doubled}: ${renderHand(s.hand)}  (${v.total}${v.soft ? ' soft' : ''})`,
    );
  }

  if (table.finished && table.results) {
    lines.push('', table.results);
  } else {
    const s = table.seats[table.turn];
    lines.push('', `It's <@${s.userId}>'s turn.`);
  }

  return { content: lines.join('\n'), components: rows(table) };
}

/** Advance past any seats that are already done; settle the table if all are. */
async function advanceOrFinish(table: Table): Promise<void> {
  while (table.turn < table.seats.length && table.seats[table.turn].done) {
    table.turn++;
  }
  if (table.turn < table.seats.length) return;

  // All players have acted — dealer plays once and we settle each seat.
  dealerPlay({
    userId: '',
    bet: table.bet,
    deck: table.deck,
    player: [],
    dealer: table.dealer,
    doubled: false,
    finished: false,
  });
  table.finished = true;

  const resultLines: string[] = [];
  for (const s of table.seats) {
    const stake = s.doubled ? table.bet * 2 : table.bet;
    const { delta, label } = await settleHand(s.userId, stake, s.hand, table.dealer);
    const sign = delta >= 0 ? '+' : '';
    resultLines.push(`**${s.name}** ${label} (${sign}${delta.toLocaleString()})`);
  }
  table.results = resultLines.join('\n');
}

export async function handleBlackjack2Button(interaction: ButtonInteraction): Promise<void> {
  const table = tables.get(interaction.message.id);
  if (!table) {
    await interaction.reply({ content: 'This game has expired.', ephemeral: true });
    return;
  }

  const action = interaction.customId.split(':')[1];

  // --- Lobby phase ---
  if (!table.started) {
    if (interaction.user.id !== table.opponentId) {
      await interaction.reply({ content: 'This invite is for someone else.', ephemeral: true });
      return;
    }
    if (action === 'decline') {
      await credit(table.challengerId, table.bet); // refund challenger's ante
      tables.delete(interaction.message.id);
      await interaction.update({
        content: `<@${table.opponentId}> declined the challenge. Ante refunded.`,
        components: [],
      });
      return;
    }
    if (action === 'join') {
      const ok = await tryDebit(table.opponentId, table.bet);
      if (!ok) {
        const bal = await getBalance(table.opponentId);
        await interaction.reply({
          content: `Not enough coins. You have **${bal.toLocaleString()}**, need **${table.bet.toLocaleString()}**.`,
          ephemeral: true,
        });
        return;
      }
      // Deal the table.
      table.seats[0].hand = [table.deck.pop()!, table.deck.pop()!];
      table.seats[1].hand = [table.deck.pop()!, table.deck.pop()!];
      table.dealer = [table.deck.pop()!, table.deck.pop()!];
      table.started = true;
      table.turn = 0;

      // Auto-skip any player dealt a natural blackjack.
      for (const s of table.seats) if (isBlackjack(s.hand)) s.done = true;
      await advanceOrFinish(table);

      const v = view(table);
      if (table.finished) tables.delete(interaction.message.id);
      await interaction.update(v);
      return;
    }
    return;
  }

  // --- Play phase ---
  if (table.finished) {
    await interaction.reply({ content: 'This game is already finished.', ephemeral: true });
    return;
  }

  const seat = table.seats[table.turn];
  if (interaction.user.id !== seat.userId) {
    await interaction.reply({ content: "It's not your turn.", ephemeral: true });
    return;
  }

  if (action === 'hit') {
    seat.hand.push(table.deck.pop()!);
    if (handValue(seat.hand).total >= 21) seat.done = true; // bust or 21 ends the turn
  } else if (action === 'stand') {
    seat.done = true;
  } else if (action === 'double') {
    if (seat.hand.length !== 2 || seat.doubled) {
      await interaction.reply({
        content: 'You can only double on your first action.',
        ephemeral: true,
      });
      return;
    }
    const ok = await tryDebit(seat.userId, table.bet);
    if (!ok) {
      await interaction.reply({ content: 'Not enough coins to double.', ephemeral: true });
      return;
    }
    seat.doubled = true;
    seat.hand.push(table.deck.pop()!);
    seat.done = true; // double = exactly one card, then stand
  } else {
    return;
  }

  if (seat.done) await advanceOrFinish(table);

  const v = view(table);
  if (table.finished) tables.delete(interaction.message.id);
  await interaction.update(v);
}

export const blackjack2: Command = {
  data: new SlashCommandBuilder()
    .setName('blackjack2')
    .setDescription('Play a hand of blackjack against another player (shared dealer)')
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
      const bal = await getBalance(challengerId);
      await interaction.reply({
        content: `Not enough coins. You have **${bal.toLocaleString()}**, tried to bet **${bet.toLocaleString()}**.`,
        ephemeral: true,
      });
      return;
    }

    const table: Table = {
      bet,
      deck: freshDeck(),
      dealer: [],
      seats: [
        { userId: challengerId, name: interaction.user.username, hand: [], doubled: false, done: false },
        { userId: opponent.id, name: opponent.username, hand: [], doubled: false, done: false },
      ],
      turn: 0,
      started: false,
      finished: false,
      challengerId,
      opponentId: opponent.id,
    };

    const v = view(table);
    const reply = await interaction.reply({
      content: v.content,
      components: v.components,
      withResponse: true,
    });
    const messageId = reply.resource?.message?.id;
    if (messageId) tables.set(messageId, table);
  },
};
