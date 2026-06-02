import { credit, getBalance, tryDebit } from './wallet.ts';

export type Suit = '♠' | '♥' | '♦' | '♣';
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';
export interface Card {
  rank: Rank;
  suit: Suit;
}

const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUITS: Suit[] = ['♠', '♥', '♦', '♣'];

export function freshDeck(): Card[] {
  const deck: Card[] = [];
  for (const s of SUITS) for (const r of RANKS) deck.push({ rank: r, suit: s });
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export function handValue(hand: Card[]): { total: number; soft: boolean } {
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

export function isBlackjack(hand: Card[]): boolean {
  return hand.length === 2 && handValue(hand).total === 21;
}

export function renderHand(hand: Card[], hideHole = false): string {
  const cards = hand.map((c, i) => (hideHole && i === 1 ? '🂠' : `${c.rank}${c.suit}`));
  return cards.join(' ');
}

export interface Game {
  userId: string;
  bet: number;
  deck: Card[];
  player: Card[];
  dealer: Card[];
  doubled: boolean;
  finished: boolean;
}

export type Outcome =
  | 'player-bust'
  | 'dealer-bust'
  | 'player-win'
  | 'dealer-win'
  | 'push'
  | 'blackjack';

export function newGame(userId: string, bet: number): Game {
  const deck = freshDeck();
  return {
    userId,
    bet,
    deck,
    player: [deck.pop()!, deck.pop()!],
    dealer: [deck.pop()!, deck.pop()!],
    doubled: false,
    finished: false,
  };
}

export async function settle(game: Game, outcome: Outcome): Promise<string> {
  game.finished = true;
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

export function dealerPlay(game: Game): void {
  while (true) {
    const v = handValue(game.dealer);
    if (v.total < 17 || (v.total === 17 && v.soft)) {
      game.dealer.push(game.deck.pop()!);
    } else break;
  }
}

export async function finishWithDealer(game: Game): Promise<string> {
  dealerPlay(game);
  const p = handValue(game.player).total;
  const d = handValue(game.dealer).total;
  game.finished = true;
  if (d > 21) return settle(game, 'dealer-bust');
  if (p > d) return settle(game, 'player-win');
  if (p < d) return settle(game, 'dealer-win');
  return settle(game, 'push');
}

export async function doubleDown(game: Game): Promise<boolean> {
  const ok = await tryDebit(game.userId, game.bet);
  if (!ok) return false;
  game.doubled = true;
  game.player.push(game.deck.pop()!);
  return true;
}

export function hit(game: Game): number {
  game.player.push(game.deck.pop()!);
  return handValue(game.player).total;
}
