import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { type C4Game, COLS, isColumnPlayable } from './game.ts';

export const DISC_R = '🔴';
export const DISC_Y = '🟡';
export const DISC_EMPTY = '⚫';

export interface Match {
  game: C4Game;
  redUserId: string;
  yellowUserId: string;
  /** True when yellow is the bot AI (solo mode). */
  vsBot: boolean;
  timeoutHandle: ReturnType<typeof setTimeout>;
}

export function userTag(id: string): string {
  return `<@${id}>`;
}

/** Display label for a side — a mention, or "🤖 Bot" when it's the AI. */
export function sideLabel(match: Match, disc: 'R' | 'Y'): string {
  const id = disc === 'R' ? match.redUserId : match.yellowUserId;
  if (match.vsBot && disc === 'Y') return '🤖 Bot';
  return userTag(id);
}

export function currentPlayerId(match: Match): string {
  return match.game.turn === 'R' ? match.redUserId : match.yellowUserId;
}

export function buildEmbed(match: Match, statusOverride?: string): EmbedBuilder {
  const { game } = match;

  const rows = game.board
    .map((row, r) =>
      row
        .map((cell, c) => {
          if (!cell) return DISC_EMPTY;
          const isWinning = game.winningCells?.some(([wr, wc]) => wr === r && wc === c) ?? false;
          if (isWinning) return cell === 'R' ? '🟥' : '🟨';
          return cell === 'R' ? DISC_R : DISC_Y;
        })
        .join(''),
    )
    .join('\n');

  let status: string;
  if (statusOverride) {
    status = statusOverride;
  } else if (game.winner === 'draw') {
    status = '🤝 Draw!';
  } else if (game.winner) {
    const disc = game.winner === 'R' ? DISC_R : DISC_Y;
    status = `🏆 ${sideLabel(match, game.winner)} ${disc} wins!`;
  } else {
    const disc = game.turn === 'R' ? DISC_R : DISC_Y;
    status = `${disc} ${sideLabel(match, game.turn)}'s turn`;
  }

  return new EmbedBuilder()
    .setTitle('Connect Four')
    .setDescription(`${sideLabel(match, 'R')} ${DISC_R}  vs  ${DISC_Y} ${sideLabel(match, 'Y')}\n\n${rows}`)
    .setFooter({ text: status });
}

// Discord allows at most 5 buttons per action row, so the 7 columns are
// split across two rows (4 + 3).
const BUTTONS_PER_ROW = 5;

export function buildColumnButtons(game: C4Game): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let start = 0; start < COLS; start += BUTTONS_PER_ROW) {
    const row = new ActionRowBuilder<ButtonBuilder>();
    for (let c = start; c < Math.min(start + BUTTONS_PER_ROW, COLS); c++) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`c4:${c}`)
          .setLabel(String(c + 1))
          .setStyle(ButtonStyle.Primary)
          .setDisabled(game.finished || !isColumnPlayable(game, c)),
      );
    }
    rows.push(row);
  }
  return rows;
}
