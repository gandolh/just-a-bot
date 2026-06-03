import type { DiceGameWire } from '@bots/shared';

const DIE_FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'] as const;

function face(n: number): string {
  return DIE_FACES[n - 1] ?? '🎲';
}

interface Props {
  me: { id: string; username: string; avatar: string | null };
  state: DiceGameWire;
}

export function ResultView({ me, state }: Props) {
  // Highest total first.
  const players = Object.values(state.players).sort(
    (a, b) => (b.total ?? -1) - (a.total ?? -1),
  );
  const winners = state.winnerIds
    .map((id) => state.players[id])
    .filter((p): p is NonNullable<typeof p> => Boolean(p));
  const share = winners.length > 0 ? Math.floor(state.pot / winners.length) : 0;
  const iWon = state.winnerIds.includes(me.id);

  const headline =
    winners.length === 0
      ? 'No winner.'
      : winners.length === 1
        ? `${winners[0].tag} wins the pot of ${state.pot.toLocaleString()}! 🎉`
        : `Tie! ${winners.map((w) => w.tag).join(' & ')} split ${state.pot.toLocaleString()} (${share.toLocaleString()} each).`;

  return (
    <main className="shell finished">
      <h1>{iWon ? '🏆 You win!' : '🎲 Results'}</h1>
      <p className="tag">{headline}</p>

      <ul className="player-list">
        {players.map((p) => {
          const won = state.winnerIds.includes(p.userId);
          return (
            <li key={p.userId} className={won ? 'winner-row' : undefined}>
              <span className="dice-faces">
                {p.dice ? `${face(p.dice[0])} ${face(p.dice[1])}` : '— —'}
              </span>
              <strong className="total">{p.total ?? '?'}</strong>
              {p.tag}
              {won && <span className="you-tag">winner</span>}
              {p.userId === me.id && <span className="you-tag">you</span>}
            </li>
          );
        })}
      </ul>

      <p className="hint">A new table can be opened once this one closes.</p>
    </main>
  );
}
