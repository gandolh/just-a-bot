import type { ActionsBlock, Block, Button, KnownBlock } from '@slack/types';
import { applyMove, botMove, Game, newGame } from './game.ts';

interface Match {
  game: Game;
  xUserId: string;
  oUserId: string | null; // null = bot
}

const matches = new Map<string, Match>();

function tag(id: string | null): string {
  return id === null ? ':robot_face: bot' : `<@${id}>`;
}

function currentPlayerId(m: Match): string | null {
  return m.game.turn === 'X' ? m.xUserId : m.oUserId;
}

function cellLabel(cell: 'X' | 'O' | null): string {
  if (cell === 'X') return ':x:';
  if (cell === 'O') return ':o:';
  return '·';
}

export interface View {
  text: string;
  blocks: (Block | KnownBlock)[];
}

export function renderMatch(m: Match): View {
  const { game } = m;
  const header = `*Tic-Tac-Toe* — ${tag(m.xUserId)} (:x:) vs ${tag(m.oUserId)} (:o:)`;
  let status: string;
  if (game.winner === 'draw') status = ':handshake: Draw.';
  else if (game.winner) {
    const winnerId = game.winner === 'X' ? m.xUserId : m.oUserId;
    status = `:trophy: ${tag(winnerId)} (${game.winner === 'X' ? ':x:' : ':o:'}) wins!`;
  } else {
    status = `Turn: ${tag(currentPlayerId(m))} (${game.turn === 'X' ? ':x:' : ':o:'})`;
  }

  const blocks: (Block | KnownBlock)[] = [
    { type: 'section', text: { type: 'mrkdwn', text: `${header}\n${status}` } },
  ];

  for (let r = 0; r < 3; r++) {
    const elements: Button[] = [];
    for (let c = 0; c < 3; c++) {
      const i = r * 3 + c;
      const cell = game.board[i];
      const winning = game.winningLine?.includes(i) ?? false;
      const disabled = game.finished || cell !== null;
      const btn: Button = {
        type: 'button',
        text: { type: 'plain_text', text: cellLabel(cell), emoji: true },
        action_id: disabled ? `ttt_disabled:${i}:${Date.now()}_${r}_${c}` : `ttt:${i}`,
        value: String(i),
      };
      if (winning) btn.style = 'primary';
      else if (cell === 'X') btn.style = 'danger';
      elements.push(btn);
    }
    const actions: ActionsBlock = { type: 'actions', elements };
    blocks.push(actions);
  }

  return { text: `${header} — ${status}`, blocks };
}

export interface StartArgs {
  challengerId: string;
  opponentId: string | null;
}

export function createMatch({ challengerId, opponentId }: StartArgs): { match: Match; view: View } {
  const match: Match = { game: newGame(), xUserId: challengerId, oUserId: opponentId };
  return { match, view: renderMatch(match) };
}

export function registerMatch(messageTs: string, m: Match): void {
  matches.set(messageTs, m);
}

export function getMatch(messageTs: string): Match | undefined {
  return matches.get(messageTs);
}

export function deleteMatch(messageTs: string): void {
  matches.delete(messageTs);
}

export interface MoveArgs {
  messageTs: string;
  cell: number;
  userId: string;
}

export type MoveOutcome =
  | { kind: 'ok'; view: View; finished: boolean }
  | { kind: 'expired' }
  | { kind: 'finished' }
  | { kind: 'wrong-turn' }
  | { kind: 'bot-thinking' }
  | { kind: 'invalid' };

export function applyMatchMove({ messageTs, cell, userId }: MoveArgs): MoveOutcome {
  const m = matches.get(messageTs);
  if (!m) return { kind: 'expired' };
  if (m.game.finished) return { kind: 'finished' };
  const expected = currentPlayerId(m);
  if (expected === null) return { kind: 'bot-thinking' };
  if (expected !== userId) return { kind: 'wrong-turn' };

  if (!applyMove(m.game, cell, m.game.turn)) return { kind: 'invalid' };

  // Bot move if applicable.
  if (!m.game.finished && m.oUserId === null && m.game.turn === 'O') {
    const c = botMove(m.game.board, 'O');
    applyMove(m.game, c, 'O');
  }

  const view = renderMatch(m);
  const finished = m.game.finished;
  if (finished) matches.delete(messageTs);
  return { kind: 'ok', view, finished };
}
