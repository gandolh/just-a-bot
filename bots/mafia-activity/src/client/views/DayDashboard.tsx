import { useEffect, useMemo, useState } from 'react';
import type { RedactedGame } from '@bots/shared';
import type { PlayClient } from '../ws-client.ts';

interface Props {
  client: PlayClient;
  me: { id: string; username: string; avatar: string | null };
  state: RedactedGame;
}

export function DayDashboard({ client, me, state }: Props) {
  const remaining = useDeadlineSeconds(state.phaseDeadline);
  const youAlive = state.you.alive;

  const alive = useMemo(
    () => Object.values(state.players).filter((p) => p.alive),
    [state.players],
  );

  const tally = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of state.votes) m.set(v.targetId, (m.get(v.targetId) ?? 0) + 1);
    return m;
  }, [state.votes]);

  const myVote = state.votes.find((v) => v.voterId === me.id);
  const myLocked = !!myVote?.locked;
  const canLock = remaining !== null && remaining <= 30 && myVote && !myLocked;

  const onVote = (targetId: string) => {
    if (!youAlive || myLocked) return;
    if (myVote?.targetId === targetId) {
      client.send({ kind: 'action', action: { kind: 'retract-vote' } });
    } else {
      client.send({ kind: 'action', action: { kind: 'vote', targetId } });
    }
  };

  const onLock = () => {
    if (canLock) client.send({ kind: 'action', action: { kind: 'lock-vote' } });
  };

  return (
    <main className="shell day">
      <header className="day-header">
        <h2>Day {state.day}</h2>
        <p className="tag">
          {remaining !== null ? `${remaining}s` : '–'} ·{' '}
          {state.votes.length}/{alive.length} voted
        </p>
      </header>

      <ul className="portraits">
        {alive.map((p) => {
          const count = tally.get(p.userId) ?? 0;
          const selected = myVote?.targetId === p.userId;
          const isSelf = p.userId === me.id;
          return (
            <li key={p.userId}>
              <button
                type="button"
                className={`portrait ${selected ? 'voted' : ''} ${isSelf ? 'self' : ''}`}
                disabled={!youAlive || isSelf || myLocked}
                onClick={() => onVote(p.userId)}
              >
                <span className="name">{p.tag}</span>
                {count > 0 && <span className="tally">{count}</span>}
              </button>
            </li>
          );
        })}
      </ul>

      <footer className="day-footer">
        {!youAlive && <p className="tag">You're dead. Spectating.</p>}
        {youAlive && myLocked && <p className="tag">🔒 Vote locked</p>}
        {youAlive && !myLocked && canLock && (
          <button type="button" className="primary" onClick={onLock}>
            Lock my vote
          </button>
        )}
        {youAlive && !myLocked && !canLock && myVote && (
          <p className="hint">Lock button appears at T-30s</p>
        )}
        {youAlive && !myVote && (
          <p className="hint">Click a portrait to vote</p>
        )}
      </footer>
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
