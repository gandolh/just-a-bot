import type { MafiaGame, Player, Role } from './store.ts';

export function assignRoles(players: Player[]): void {
  const n = players.length;
  const mafiaCount = Math.max(1, Math.floor(n / 4));
  const doctorCount = n >= 6 ? 1 : 0;

  const shuffled = [...players].sort(() => Math.random() - 0.5);
  for (let i = 0; i < shuffled.length; i++) {
    if (i < mafiaCount) {
      shuffled[i].role = 'mafia';
    } else if (i < mafiaCount + doctorCount) {
      shuffled[i].role = 'doctor';
    } else {
      shuffled[i].role = 'town';
    }
  }
}

export function alivePlayers(game: MafiaGame): Player[] {
  return Object.values(game.players).filter((p) => p.alive);
}

export function aliveByRole(game: MafiaGame, role: Role): Player[] {
  return alivePlayers(game).filter((p) => p.role === role);
}

export function checkWin(game: MafiaGame): 'town' | 'mafia' | null {
  const alive = alivePlayers(game);
  const aliveMafia = alive.filter((p) => p.role === 'mafia').length;
  const aliveTown = alive.filter((p) => p.role !== 'mafia').length;
  if (aliveMafia === 0) return 'town';
  if (aliveMafia >= aliveTown) return 'mafia';
  return null;
}
