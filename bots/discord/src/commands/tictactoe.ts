import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from 'discord.js';
import { applyMove, botMove, Game, newGame } from '../tictactoe/game.ts';
import type { Command } from './types.ts';

interface Match {
  game: Game;
  xUserId: string;
  oUserId: string | null; // null = bot
}

const matches = new Map<string, Match>();

function userTag(id: string | null): string {
  return id === null ? '🤖 bot' : `<@${id}>`;
}

function currentPlayerId(match: Match): string | null {
  return match.game.turn === 'X' ? match.xUserId : match.oUserId;
}

function renderBoard(match: Match): {
  content: string;
  components: ActionRowBuilder<ButtonBuilder>[];
} {
  const { game } = match;
  const header = `**Tic-Tac-Toe** — ${userTag(match.xUserId)} (❌) vs ${userTag(match.oUserId)} (⭕)`;
  let status: string;
  if (game.winner === 'draw') status = '🤝 Draw.';
  else if (game.winner) {
    const winnerId = game.winner === 'X' ? match.xUserId : match.oUserId;
    status = `🏆 ${userTag(winnerId)} (${game.winner === 'X' ? '❌' : '⭕'}) wins!`;
  } else {
    status = `Turn: ${userTag(currentPlayerId(match))} (${game.turn === 'X' ? '❌' : '⭕'})`;
  }

  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let r = 0; r < 3; r++) {
    const row = new ActionRowBuilder<ButtonBuilder>();
    for (let c = 0; c < 3; c++) {
      const i = r * 3 + c;
      const cell = game.board[i];
      const winning = game.winningLine?.includes(i) ?? false;
      const btn = new ButtonBuilder()
        .setCustomId(`ttt:${i}`)
        .setLabel(cell === 'X' ? '❌' : cell === 'O' ? '⭕' : '⬜')
        .setStyle(
          winning
            ? ButtonStyle.Success
            : cell === 'X'
              ? ButtonStyle.Danger
              : cell === 'O'
                ? ButtonStyle.Primary
                : ButtonStyle.Secondary,
        )
        .setDisabled(game.finished || cell !== null);
      row.addComponents(btn);
    }
    rows.push(row);
  }
  return { content: [header, status].join('\n'), components: rows };
}

async function maybePlayBot(match: Match): Promise<void> {
  if (match.game.finished) return;
  if (match.oUserId !== null) return;
  if (match.game.turn !== 'O') return;
  const cell = botMove(match.game.board, 'O');
  applyMove(match.game, cell, 'O');
}

export async function handleTicTacToeButton(interaction: ButtonInteraction): Promise<void> {
  const match = matches.get(interaction.message.id);
  if (!match) {
    await interaction.reply({ content: 'This game has expired.', ephemeral: true });
    return;
  }
  if (match.game.finished) {
    await interaction.reply({ content: 'Game already finished.', ephemeral: true });
    return;
  }

  const expectedId = currentPlayerId(match);
  if (expectedId === null) {
    await interaction.reply({ content: 'Waiting on the bot — try again.', ephemeral: true });
    return;
  }
  if (interaction.user.id !== expectedId) {
    await interaction.reply({ content: 'Not your turn.', ephemeral: true });
    return;
  }

  const cell = parseInt(interaction.customId.split(':')[1], 10);
  const ok = applyMove(match.game, cell, match.game.turn);
  if (!ok) {
    await interaction.reply({ content: 'Invalid move.', ephemeral: true });
    return;
  }

  await maybePlayBot(match);

  if (match.game.finished) matches.delete(interaction.message.id);

  const view = renderBoard(match);
  await interaction.update({ content: view.content, components: view.components });
}

export const tictactoe: Command = {
  data: new SlashCommandBuilder()
    .setName('tictactoe')
    .setDescription('Play tic-tac-toe (vs bot or vs another user)')
    .addUserOption((opt) =>
      opt
        .setName('opponent')
        .setDescription('Opponent — leave empty to play against the bot')
        .setRequired(false),
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    const opponent = interaction.options.getUser('opponent');

    if (opponent) {
      if (opponent.id === interaction.user.id) {
        await interaction.reply({ content: "You can't play against yourself.", ephemeral: true });
        return;
      }
      if (opponent.bot) {
        await interaction.reply({
          content: 'To play against the bot, just run `/tictactoe` without an opponent.',
          ephemeral: true,
        });
        return;
      }
    }

    const match: Match = {
      game: newGame(),
      xUserId: interaction.user.id,
      oUserId: opponent?.id ?? null,
    };

    const view = renderBoard(match);
    const reply = await interaction.reply({
      content: view.content,
      components: view.components,
      withResponse: true,
    });
    const messageId = reply.resource?.message?.id;
    if (messageId) matches.set(messageId, match);
  },
};
