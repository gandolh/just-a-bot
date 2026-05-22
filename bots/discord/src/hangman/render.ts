import type { HangmanGame } from './game.ts';

// 7 frames: 0 wrong → 6 wrong
const GALLOWS = [
  [
    '    ┌───┐',
    '    │    ',
    '    │    ',
    '    │    ',
    '    │    ',
    '    └────',
  ],
  [
    '    ┌───┐',
    '    │   O',
    '    │    ',
    '    │    ',
    '    │    ',
    '    └────',
  ],
  [
    '    ┌───┐',
    '    │   O',
    '    │   |',
    '    │    ',
    '    │    ',
    '    └────',
  ],
  [
    '    ┌───┐',
    '    │   O',
    '    │  /|',
    '    │    ',
    '    │    ',
    '    └────',
  ],
  [
    '    ┌───┐',
    '    │   O',
    '    │  /|\\',
    '    │    ',
    '    │    ',
    '    └────',
  ],
  [
    '    ┌───┐',
    '    │   O',
    '    │  /|\\',
    '    │  / ',
    '    │    ',
    '    └────',
  ],
  [
    '    ┌───┐',
    '    │   O',
    '    │  /|\\',
    '    │  / \\',
    '    │    ',
    '    └────',
  ],
];

export function renderState(game: HangmanGame): string {
  const frame = GALLOWS[Math.min(game.wrongLetters.length, GALLOWS.length - 1)];
  const gallows = frame.join('\n');

  const wordDisplay = game.revealed.join(' ');
  const wrongDisplay = game.wrongLetters.length > 0
    ? game.wrongLetters.join(', ')
    : '—';

  const lines = [
    `**Category:** ${game.category}`,
    `**Word:** \`${wordDisplay}\``,
    `**Wrong:** ${wrongDisplay} (${game.wrongLetters.length}/${game.maxWrong})`,
    '',
    `\`\`\``,
    gallows,
    `\`\`\``,
  ];

  return lines.join('\n');
}
