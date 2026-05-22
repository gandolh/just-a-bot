import type { RedactedGame } from '@bots/shared';
import type { PlayClient } from '../ws-client.ts';

interface Props {
  client: PlayClient;
  me: { id: string; username: string; avatar: string | null };
  state: RedactedGame;
}

export function NightView({ client, me, state }: Props) {
  const role = state.you.role;
  const targets = state.nightTargets ?? [];
  const alivePlayers = Object.values(state.players).filter((p) => p.alive);

  return (
    <main className="shell night">
      <h2>Night {state.day}</h2>
      <p className="tag">🌙 the village sleeps</p>

      {!state.you.alive && <p className="hint">You're dead. Spectating.</p>}

      {state.you.alive && role === 'mafia' && (
        <NightPicker
          label="Choose a kill target"
          targets={targets}
          allPlayers={alivePlayers}
          onPick={(id) => client.send({ kind: 'action', action: { kind: 'kill', targetId: id } })}
        />
      )}

      {state.you.alive && role === 'doctor' && (
        <NightPicker
          label="Choose someone to save"
          targets={targets.length ? targets : alivePlayers.map((p) => p.userId)}
          allPlayers={alivePlayers}
          onPick={(id) => client.send({ kind: 'action', action: { kind: 'save', targetId: id } })}
        />
      )}

      {state.you.alive && role === 'town' && (
        <p className="hint">You sleep peacefully…</p>
      )}
    </main>
  );
}

interface PickerProps {
  label: string;
  targets: string[];
  allPlayers: Array<{ userId: string; tag: string }>;
  onPick: (userId: string) => void;
}

function NightPicker({ label, targets, allPlayers, onPick }: PickerProps) {
  const byId = new Map(allPlayers.map((p) => [p.userId, p]));
  return (
    <div className="night-picker">
      <h3>{label}</h3>
      <ul className="portraits">
        {targets.map((id) => {
          const p = byId.get(id);
          if (!p) return null;
          return (
            <li key={id}>
              <button type="button" className="portrait" onClick={() => onPick(id)}>
                <span className="name">{p.tag}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
