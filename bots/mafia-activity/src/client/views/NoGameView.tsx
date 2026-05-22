import type { PlayClient } from '../ws-client.ts';

interface Props {
  client: PlayClient;
  me: { id: string; username: string; avatar: string | null };
}

export function NoGameView({ client }: Props) {
  return (
    <main className="shell">
      <h1>Mafia2</h1>
      <p className="tag">No game running in this voice channel.</p>
      <button
        type="button"
        className="primary"
        onClick={() => client.send({ kind: 'lobby-start' })}
      >
        Start a new game
      </button>
      <p className="hint">Minimum 5 players to start.</p>
    </main>
  );
}
