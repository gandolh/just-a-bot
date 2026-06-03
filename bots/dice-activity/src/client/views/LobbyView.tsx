import { useEffect, useState } from 'react';
import type { DiceGameWire } from '@bots/shared';
import type { PlayClient } from '../ws-client.ts';

interface Props {
  client: PlayClient;
  me: { id: string; username: string; avatar: string | null };
  state: DiceGameWire;
}

export function LobbyView({ client, me, state }: Props) {
  const players = Object.values(state.players);
  const joined = players.some((p) => p.userId === me.id);
  const isHost = state.starterId === me.id;
  const enough = players.length >= 2;
  const remaining = useDeadlineSeconds(state.phaseDeadline);

  return (
    <main className="shell">
      <h1>🎲 Dice Table</h1>
      <p className="tag">
        Ante <strong>{state.bet.toLocaleString()}</strong> · pot{' '}
        <strong>{state.pot.toLocaleString()}</strong>
        {remaining !== null && ` · ${remaining}s until auto-roll`}
      </p>

      <ul className="player-list">
        {players.map((p) => (
          <li key={p.userId}>
            <span className="dot" />
            {p.tag}
            {p.userId === state.starterId && <span className="you-tag">host</span>}
            {p.userId === me.id && <span className="you-tag">you</span>}
          </li>
        ))}
      </ul>

      {!joined && (
        <button type="button" className="primary" onClick={() => client.send({ kind: 'join' })}>
          Join · ante {state.bet.toLocaleString()}
        </button>
      )}
      {joined && isHost && (
        <button
          type="button"
          className="primary"
          disabled={!enough}
          onClick={() => client.send({ kind: 'roll-now' })}
        >
          Roll now
        </button>
      )}
      {joined && !isHost && <p className="hint">Waiting for the host to roll…</p>}
      {joined && isHost && !enough && <p className="hint">Need at least 2 players to roll.</p>}
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
