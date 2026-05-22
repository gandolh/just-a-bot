import { WORDS, ALL_CATEGORIES } from './words.ts';

export type HangmanGame = {
  threadId: string;
  parentChannelId: string;
  starterId: string;
  word: string;
  category: string;
  revealed: string[];
  wrongLetters: string[];
  guessedLetters: Set<string>;
  maxWrong: number;
  state: 'active' | 'won' | 'lost';
  startedAt: string;
};

export const games = new Map<string, HangmanGame>();

export function hasHangmanGame(threadId: string): boolean {
  return games.has(threadId);
}

export function pickWord(category: string): string {
  const list = WORDS[category];
  return list[Math.floor(Math.random() * list.length)];
}

export function resolveCategory(input?: string): string {
  if (input && WORDS[input]) return input;
  return ALL_CATEGORIES[Math.floor(Math.random() * ALL_CATEGORIES.length)];
}

export function newGame(
  threadId: string,
  parentChannelId: string,
  starterId: string,
  category: string,
): HangmanGame {
  const word = pickWord(category);
  const revealed = word.split('').map(() => '_');
  return {
    threadId,
    parentChannelId,
    starterId,
    word,
    category,
    revealed,
    wrongLetters: [],
    guessedLetters: new Set(),
    maxWrong: 6,
    state: 'active',
    startedAt: new Date().toISOString(),
  };
}

export type GuessOutcome =
  | { kind: 'already_guessed' }
  | { kind: 'correct'; positions: number[] }
  | { kind: 'wrong' }
  | { kind: 'won' }
  | { kind: 'lost' };

export function applyGuess(game: HangmanGame, letter: string): GuessOutcome {
  const l = letter.toLowerCase();

  if (game.guessedLetters.has(l)) {
    return { kind: 'already_guessed' };
  }

  game.guessedLetters.add(l);

  const positions: number[] = [];
  for (let i = 0; i < game.word.length; i++) {
    if (game.word[i] === l) {
      game.revealed[i] = l;
      positions.push(i);
    }
  }

  if (positions.length === 0) {
    game.wrongLetters.push(l);
    game.wrongLetters.sort();

    if (game.wrongLetters.length >= game.maxWrong) {
      game.state = 'lost';
      return { kind: 'lost' };
    }
    return { kind: 'wrong' };
  }

  if (!game.revealed.includes('_')) {
    game.state = 'won';
    return { kind: 'won' };
  }

  return { kind: 'correct', positions };
}
