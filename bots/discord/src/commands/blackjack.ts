import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import { credit, getBalance, tryDebit } from '../wallet.ts';
import type { Command } from './types.ts';

type Suit = '♠' | '♥' | '♦' | '♣';
type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';
interface Card {
  rank: Rank;
  suit: Suit;
}

const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUITS: Suit[] = ['♠', '♥', '♦', '♣'];

function freshDeck(): Card[] {
  const deck: Card[] = [];
  for (const s of SUITS) for (const r of RANKS) deck.push({ rank: r, suit: s });
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function handValue(hand: Card[]): { total: number; soft: boolean } {
  let total = 0;
  let aces = 0;
  for (const c of hand) {
    if (c.rank === 'A') {
      aces++;
      total += 11;
    } else if (c.rank === 'K' || c.rank === 'Q' || c.rank === 'J') {
      total += 10;
    } else {
      total += Number(c.rank);
    }
  }
  let soft = aces > 0;
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
    if (aces === 0) soft = false;
  }
  return { total, soft };
}

function isBlackjack(hand: Card[]): boolean {
  return hand.length === 2 && handValue(hand).total === 21;
}

function renderHand(hand: Card[], hideHole = false): string {
  const cards = hand.map((c, i) => (hideHole && i === 1 ? '🂠' : `${c.rank}${c.suit}`));
  return cards.join(' ');
}

interface Game {
  userId: string;
  bet: number;
  deck: Card[];
  player: Card[];
  dealer: Card[];
  doubled: boolean;
  finished: boolean;
}

function buttons(disabled: boolean, canDouble: boolean): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('bj:hit')
      .setLabel('Hit')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId('bj:stand')
      .setLabel('Stand')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId('bj:double')
      .setLabel('Double')
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled || !canDouble),
  );
}

function gameView(game: Game, opts: { reveal: boolean; status?: string }): {
  content: string;
  components: ActionRowBuilder<ButtonBuilder>[];
} {
  const playerVal = handValue(game.player);
  const dealerShown = opts.reveal ? handValue(game.dealer).total : '?';
  const lines = [
    `**Blackjack** — bet: **${game.bet.toLocaleString()}**${game.doubled ? ' (doubled)' : ''}`,
    `Dealer: ${renderHand(game.dealer, !opts.reveal)}  (${dealerShown})`,
    `You:    ${renderHand(game.player)}  (${playerVal.total}${playerVal.soft ? ' soft' : ''})`,
  ];
  if (opts.status) lines.push('', opts.status);
  const canDouble = game.player.length === 2 && !game.doubled;
  return {
    content: lines.join('\n'),
    components: [buttons(game.finished, canDouble)],
  };
}

async function settle(
  game: Game,
  outcome: 'player-bust' | 'dealer-bust' | 'player-win' | 'dealer-win' | 'push' | 'blackjack',
): Promise<string> {
  const stake = game.doubled ? game.bet * 2 : game.bet;
  let delta = 0;
  let label = '';
  switch (outcome) {
    case 'player-bust':
      delta = -stake;
      label = 'Bust! You lose.';
      break;
    case 'dealer-bust':
      delta = stake;
      label = 'Dealer busts. You win!';
      break;
    case 'player-win':
      delta = stake;
      label = 'You win!';
      break;
    case 'dealer-win':
      delta = -stake;
      label = 'Dealer wins.';
      break;
    case 'push':
      delta = 0;
      label = 'Push.';
      break;
    case 'blackjack':
      delta = Math.floor(stake * 1.5);
      label = 'Blackjack! 3:2 payout.';
      break;
  }
  if (delta > 0) await credit(game.userId, stake + delta);
  else if (delta === 0) await credit(game.userId, stake);
  const balance = await getBalance(game.userId);
  const sign = delta >= 0 ? '+' : '';
  return `${label} Net: **${sign}${delta.toLocaleString()}**. Balance: **${balance.toLocaleString()}**.`;
}

function dealerPlay(game: Game): void {
  while (true) {
    const v = handValue(game.dealer);
    if (v.total < 17 || (v.total === 17 && v.soft)) {
      game.dealer.push(game.deck.pop()!);
    } else break;
  }
}

async function finishWithDealer(game: Game): Promise<string> {
  dealerPlay(game);
  const p = handValue(game.player).total;
  const d = handValue(game.dealer).total;
  game.finished = true;
  if (d > 21) return settle(game, 'dealer-bust');
  if (p > d) return settle(game, 'player-win');
  if (p < d) return settle(game, 'dealer-win');
  return settle(game, 'push');
}

const games = new Map<string, Game>();

export async function handleBlackjackButton(interaction: ButtonInteraction): Promise<void> {
  const game = games.get(interaction.message.id);
  if (!game) {
    await interaction.reply({ content: 'This game has expired.', ephemeral: true });
    return;
  }
  if (interaction.user.id !== game.userId) {
    await interaction.reply({ content: 'This is not your game.', ephemeral: true });
    return;
  }
  if (game.finished) {
    await interaction.reply({ content: 'Game already finished.', ephemeral: true });
    return;
  }

  const action = interaction.customId.split(':')[1];
  let status: string | undefined;
  let reveal = false;

  if (action === 'hit') {
    game.player.push(game.deck.pop()!);
    const v = handValue(game.player).total;
    if (v > 21) {
      reveal = true;
      status = await settle(game, 'player-bust');
    } else if (v === 21) {
      status = await finishWithDealer(game);
      reveal = true;
    }
  } else if (action === 'stand') {
    status = await finishWithDealer(game);
    reveal = true;
  } else if (action === 'double') {
    if (game.player.length !== 2 || game.doubled) {
      await interaction.reply({ content: 'You can only double on your first action.', ephemeral: true });
      return;
    }
    const ok = await tryDebit(game.userId, game.bet);
    if (!ok) {
      await interaction.reply({ content: 'Not enough coins to double.', ephemeral: true });
      return;
    }
    game.doubled = true;
    game.player.push(game.deck.pop()!);
    const v = handValue(game.player).total;
    if (v > 21) {
      reveal = true;
      status = await settle(game, 'player-bust');
    } else {
      status = await finishWithDealer(game);
      reveal = true;
    }
  }

  if (game.finished) games.delete(interaction.message.id);

  const view = gameView(game, { reveal, status });
  await interaction.update({ content: view.content, components: view.components });
}

export const blackjack: Command = {
  data: new SlashCommandBuilder()
    .setName('blackjack')
    .setDescription('Play a hand of blackjack')
    .addIntegerOption((opt) =>
      opt
        .setName('bet')
        .setDescription('Coins to wager')
        .setRequired(true)
        .setMinValue(1),
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    const bet = interaction.options.getInteger('bet', true);
    const userId = interaction.user.id;

    const ok = await tryDebit(userId, bet);
    if (!ok) {
      const balance = await getBalance(userId);
      await interaction.reply({
        content: `Not enough coins. You have **${balance.toLocaleString()}**, tried to bet **${bet.toLocaleString()}**.`,
        ephemeral: true,
      });
      return;
    }

    const deck = freshDeck();
    const game: Game = {
      userId,
      bet,
      deck,
      player: [deck.pop()!, deck.pop()!],
      dealer: [deck.pop()!, deck.pop()!],
      doubled: false,
      finished: false,
    };

    const playerBJ = isBlackjack(game.player);
    const dealerBJ = isBlackjack(game.dealer);

    if (playerBJ || dealerBJ) {
      game.finished = true;
      let status: string;
      if (playerBJ && dealerBJ) status = await settle(game, 'push');
      else if (playerBJ) status = await settle(game, 'blackjack');
      else status = await settle(game, 'dealer-win');
      const view = gameView(game, { reveal: true, status });
      await interaction.reply({ content: view.content, components: view.components });
      return;
    }

    const view = gameView(game, { reveal: false });
    const reply = await interaction.reply({
      content: view.content,
      components: view.components,
      withResponse: true,
    });
    const messageId = reply.resource?.message?.id;
    if (messageId) games.set(messageId, game);
  },
};

void MessageFlags;
