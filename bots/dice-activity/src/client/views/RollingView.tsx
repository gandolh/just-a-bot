import type { DiceGameWire } from '@bots/shared';

interface Props {
  me: { id: string; username: string; avatar: string | null };
  state: DiceGameWire;
}

export function RollingView({ state }: Props) {
  const players = Object.values(state.players);
  return (
    <main className="shell">
      <h1>🎲 Rolling…</h1>
      <p className="tag">Pot <strong>{state.pot.toLocaleString()}</strong></p>
      <ul className="player-list">
        {players.map((p) => (
          <li key={p.userId}>
            <span className="dot" />
            {p.tag}
            <span className="dice-roll">🎲 🎲</span>
          </li>
        ))}
      </ul>
    </main>
  );
}
