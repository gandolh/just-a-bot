import { useState } from 'react';
import type { PlayClient } from '../ws-client.ts';

interface Props {
  client: PlayClient;
  me: { id: string; username: string; avatar: string | null };
}

export function NoGameView({ client }: Props) {
  const [bet, setBet] = useState(100);

  const create = () => {
    const amount = Math.max(1, Math.floor(bet) || 0);
    client.send({ kind: 'create', bet: amount });
  };

  return (
    <main className="shell">
      <h1>🎲 Dice Table</h1>
      <p className="tag">No table running in this voice channel.</p>

      <label className="bet-field">
        <span>Ante (coins each)</span>
        <input
          type="number"
          min={1}
          value={bet}
          onChange={(e) => setBet(Number(e.target.value))}
        />
      </label>

      <button type="button" className="primary" onClick={create}>
        Open a table
      </button>
      <p className="hint">Everyone antes the same amount. Biggest roll takes the pot. Minimum 2 players.</p>
    </main>
  );
}
