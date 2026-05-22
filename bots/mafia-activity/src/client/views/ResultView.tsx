import type { RedactedGame } from '@bots/shared';

interface Props {
  state: RedactedGame;
}

export function ResultView({ state }: Props) {
  const players = Object.values(state.players);
  const lastLine = state.history[state.history.length - 1] ?? '';

  return (
    <main className="shell finished">
      <h1>Game over</h1>
      <p className="tag">{lastLine}</p>

      <h3>Roles</h3>
      <ul className="player-list">
        {players.map((p) => (
          <li key={p.userId}>
            <span className={`role-tag role-${p.role ?? 'unknown'}`}>{p.role ?? '?'}</span>
            {p.tag} {!p.alive && <span className="hint">· eliminated</span>}
          </li>
        ))}
      </ul>
    </main>
  );
}
