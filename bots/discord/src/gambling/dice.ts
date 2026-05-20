export const DIE_FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'] as const;

export function rollDie(): number {
  return 1 + Math.floor(Math.random() * 6);
}

export function rollPair(): { dice: [number, number]; total: number } {
  const a = rollDie();
  const b = rollDie();
  return { dice: [a, b], total: a + b };
}

export function renderPair(dice: [number, number]): string {
  return `${DIE_FACES[dice[0] - 1]} ${DIE_FACES[dice[1] - 1]}`;
}

export type DiceOutcome = 'win' | 'lose' | 'push';

export function resolveDuel(
  playerTotal: number,
  botTotal: number,
  bet: number,
): { outcome: DiceOutcome; delta: number; label: string } {
  if (playerTotal > botTotal) return { outcome: 'win', delta: bet, label: 'You win!' };
  if (playerTotal < botTotal) return { outcome: 'lose', delta: -bet, label: 'You lose.' };
  return { outcome: 'push', delta: 0, label: 'Push — stake returned.' };
}
