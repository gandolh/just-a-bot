import { WORDS, WORD_SET } from './words.ts';

export const WORD_LENGTH = 5;
export const MAX_ATTEMPTS = 6;

export type LetterResult = 'correct' | 'present' | 'absent';

export interface GuessResult {
  guess: string;
  letters: { letter: string; result: LetterResult }[];
}

export interface Game {
  starterId: string;
  target: string;
  guesses: GuessResult[];
  finished: boolean;
  won: boolean;
}

export function pickWord(): string {
  return WORDS[Math.floor(Math.random() * WORDS.length)];
}

export function isValidWord(word: string): boolean {
  return WORD_SET.has(word);
}

export function newGame(starterId: string, target = pickWord()): Game {
  return { starterId, target, guesses: [], finished: false, won: false };
}

export function evaluate(guess: string, target: string): GuessResult {
  const letters: { letter: string; result: LetterResult }[] = Array.from({ length: WORD_LENGTH });
  const remaining: (string | null)[] = target.split('');

  for (let i = 0; i < WORD_LENGTH; i++) {
    if (guess[i] === target[i]) {
      letters[i] = { letter: guess[i], result: 'correct' };
      remaining[i] = null;
    }
  }
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (letters[i]) continue;
    const idx = remaining.indexOf(guess[i]);
    if (idx !== -1) {
      letters[i] = { letter: guess[i], result: 'present' };
      remaining[idx] = null;
    } else {
      letters[i] = { letter: guess[i], result: 'absent' };
    }
  }
  return { guess, letters };
}

const SQUARE: Record<LetterResult, string> = {
  correct: ':large_green_square:',
  present: ':large_yellow_square:',
  absent: ':black_large_square:',
};

export function renderRow(result: GuessResult): string {
  const squares = result.letters.map((l) => SQUARE[l.result]).join('');
  const letters = result.letters.map((l) => l.letter.toUpperCase()).join(' ');
  return `${squares}  \`${letters}\``;
}

export function renderBoard(game: Game): string {
  if (game.guesses.length === 0) return '_(no guesses yet)_';
  return game.guesses.map(renderRow).join('\n');
}

export function applyGuess(game: Game, raw: string): GuessResult {
  const guess = raw.toLowerCase();
  const result = evaluate(guess, game.target);
  game.guesses.push(result);
  if (guess === game.target) {
    game.finished = true;
    game.won = true;
  } else if (game.guesses.length >= MAX_ATTEMPTS) {
    game.finished = true;
  }
  return result;
}
