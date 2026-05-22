import { useEffect, useRef, useState } from 'react';
import type { RedactedGame, SpaInbound } from '@bots/shared';
import { authenticate } from './discord.ts';
import { PlayClient } from './ws-client.ts';
import { Game } from './views/Game.tsx';
import './styles.css';

type AuthStatus =
  | { kind: 'booting' }
  | { kind: 'authorizing' }
  | { kind: 'ready'; client: PlayClient; me: { id: string; username: string; avatar: string | null } }
  | { kind: 'error'; message: string };

export type ConnectionState =
  | { kind: 'awaiting-hello' }
  | { kind: 'no-game' }
  | { kind: 'has-state'; state: RedactedGame }
  | { kind: 'engine-offline' };

export function App() {
  const [auth, setAuth] = useState<AuthStatus>({ kind: 'booting' });
  const [conn, setConn] = useState<ConnectionState>({ kind: 'awaiting-hello' });
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    (async () => {
      setAuth({ kind: 'authorizing' });
      try {
        const { session, user } = await authenticate();
        const client = new PlayClient(session);
        client.on((msg: SpaInbound) => {
          if (msg.kind === 'state') setConn({ kind: 'has-state', state: msg.state });
          else if (msg.kind === 'no-game') setConn({ kind: 'no-game' });
          else if (msg.kind === 'engine-offline') setConn({ kind: 'engine-offline' });
          else if (msg.kind === 'engine-online') setConn((prev) => prev.kind === 'engine-offline' ? { kind: 'awaiting-hello' } : prev);
          else if (msg.kind === 'rejected') console.warn('rejected:', msg.reason, msg.originalKind);
        });
        client.connect();
        setAuth({ kind: 'ready', client, me: user });
      } catch (err) {
        setAuth({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
      }
    })();
  }, []);

  if (auth.kind === 'booting' || auth.kind === 'authorizing') {
    return (
      <main className="shell">
        <h1>Mafia2</h1>
        <p className="status">{auth.kind === 'booting' ? 'Booting…' : 'Authorizing…'}</p>
      </main>
    );
  }

  if (auth.kind === 'error') {
    return (
      <main className="shell">
        <h1>Mafia2</h1>
        <p className="status status-error">Couldn't start: {auth.message}</p>
        <p className="tag">If you're testing in a browser tab, open the activity from a Discord voice channel.</p>
      </main>
    );
  }

  return <Game client={auth.client} me={auth.me} conn={conn} />;
}
