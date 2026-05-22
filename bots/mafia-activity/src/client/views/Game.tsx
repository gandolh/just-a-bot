import type { PlayClient } from '../ws-client.ts';
import type { ConnectionState } from '../App.tsx';
import { LobbyView } from './LobbyView.tsx';
import { DayDashboard } from './DayDashboard.tsx';
import { NightView } from './NightView.tsx';
import { ResultView } from './ResultView.tsx';
import { NoGameView } from './NoGameView.tsx';

interface Props {
  client: PlayClient;
  me: { id: string; username: string; avatar: string | null };
  conn: ConnectionState;
}

export function Game({ client, me, conn }: Props) {
  if (conn.kind === 'awaiting-hello') {
    return (
      <main className="shell">
        <h1>Mafia2</h1>
        <p className="status">Connecting to game server…</p>
      </main>
    );
  }
  if (conn.kind === 'engine-offline') {
    return (
      <main className="shell">
        <h1>Mafia2</h1>
        <p className="status status-error">Engine offline. Reconnecting…</p>
        <p className="tag">The bot has dropped its connection; your game will resume when it returns.</p>
      </main>
    );
  }
  if (conn.kind === 'no-game') {
    return <NoGameView client={client} me={me} />;
  }

  const { state } = conn;
  switch (state.phase) {
    case 'lobby': return <LobbyView client={client} me={me} state={state} />;
    case 'day': return <DayDashboard client={client} me={me} state={state} />;
    case 'night': return <NightView client={client} me={me} state={state} />;
    case 'finished': return <ResultView state={state} />;
  }
}
