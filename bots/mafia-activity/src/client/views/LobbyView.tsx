import { useEffect, useState } from 'react';
import type { RedactedGame } from '@bots/shared';
import type { PlayClient } from '../ws-client.ts';

interface Props {
  client: PlayClient;
  me: { id: string; username: string; avatar: string | null };
  state: RedactedGame;
}

export function LobbyView({ client, me, state }: Props) {
  const players = Object.values(state.players);
  const joined = players.some((p) => p.userId === me.id);
  const enough = players.length >= 5;
  const remaining = useDeadlineSeconds(state.phaseDeadline);

  return (
    <main className="shell">
      <h1>Lobby</h1>
      <p className="tag">
        {players.length} player{players.length === 1 ? '' : 's'} · need ≥5
        {remaining !== null && ` · ${remaining}s until auto-start`}
      </p>

      <ul className="player-list">
        {players.map((p) => (
          <li key={p.userId}>
            <span className="dot" />
            {p.tag}
            {p.userId === me.id && <span className="you-tag">you</span>}
          </li>
        ))}
      </ul>

      {!joined && (
        <button type="button" className="primary" onClick={() => client.send({ kind: 'lobby-join' })}>
          Join game
        </button>
      )}
      {joined && enough && (
        <button type="button" className="primary" onClick={() => client.send({ kind: 'lobby-start-now' })}>
          Start now
        </button>
      )}
      {joined && !enough && (
        <p className="hint">Waiting for more players…</p>
      )}
    </main>
  );
}

function useDeadlineSeconds(deadline: string | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  if (!deadline) return null;
  const ms = new Date(deadline).getTime() - now;
  if (ms <= 0) return 0;
  return Math.ceil(ms / 1000);
}
