import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
} from 'discord.js';
import {
  C4Game,
  COLS,
  ROWS,
  dropDisc,
  isColumnPlayable,
  newC4Game,
} from '../connect-four/game.ts';
import type { Command } from './types.ts';

const DISC_R = '🔴';
const DISC_Y = '🟡';
const DISC_EMPTY = '⚫';
const TIMEOUT_MS = 90_000;

interface Match {
  game: C4Game;
  redUserId: string;
  yellowUserId: string;
  timeoutHandle: ReturnType<typeof setTimeout>;
}

const matches = new Map<string, Match>();

function userTag(id: string): string {
  return `<@${id}>`;
}

function currentPlayerId(match: Match): string {
  return match.game.turn === 'R' ? match.redUserId : match.yellowUserId;
}

function buildEmbed(match: Match, statusOverride?: string): EmbedBuilder {
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
    const winnerId = game.winner === 'R' ? match.redUserId : match.yellowUserId;
    const disc = game.winner === 'R' ? DISC_R : DISC_Y;
    status = `🏆 ${userTag(winnerId)} ${disc} wins!`;
  } else {
    const disc = game.turn === 'R' ? DISC_R : DISC_Y;
    status = `${disc} ${userTag(currentPlayerId(match))}'s turn`;
  }

  return new EmbedBuilder()
    .setTitle('Connect Four')
    .setDescription(`${userTag(match.redUserId)} ${DISC_R}  vs  ${DISC_Y} ${userTag(match.yellowUserId)}\n\n${rows}`)
    .setFooter({ text: status });
}

function buildColumnButtons(game: C4Game): ActionRowBuilder<ButtonBuilder> {
  const row = new ActionRowBuilder<ButtonBuilder>();
  for (let c = 0; c < COLS; c++) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`c4:${c}`)
        .setLabel(String(c + 1))
        .setStyle(ButtonStyle.Primary)
        .setDisabled(game.finished || !isColumnPlayable(game, c)),
    );
  }
  return row;
}

export async function handleConnectFourButton(interaction: ButtonInteraction): Promise<void> {
  const match = matches.get(interaction.message.id);
  if (!match) {
    await interaction.reply({ content: 'This game has expired.', ephemeral: true });
    return;
  }
  if (match.game.finished) {
    await interaction.reply({ content: 'Game already finished.', ephemeral: true });
    return;
  }
  if (interaction.user.id !== currentPlayerId(match)) {
    await interaction.reply({ content: 'Not your turn.', ephemeral: true });
    return;
  }

  const col = parseInt(interaction.customId.split(':')[1], 10);
  const ok = dropDisc(match.game, col);
  if (!ok) {
    await interaction.reply({ content: 'That column is full.', ephemeral: true });
    return;
  }

  if (match.game.finished) {
    clearTimeout(match.timeoutHandle);
    matches.delete(interaction.message.id);
  }

  const embed = buildEmbed(match);
  const components = match.game.finished ? [] : [buildColumnButtons(match.game)];
  await interaction.update({ embeds: [embed], components });
}

export const connectFour: Command = {
  data: new SlashCommandBuilder()
    .setName('c4')
    .setDescription('Challenge someone to a game of Connect Four')
    .addUserOption((opt) =>
      opt
        .setName('opponent')
        .setDescription('The user you want to challenge')
        .setRequired(true),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const opponent = interaction.options.getUser('opponent', true);

    if (opponent.id === interaction.user.id) {
      await interaction.reply({ content: "You can't challenge yourself.", ephemeral: true });
      return;
    }
    if (opponent.bot) {
      await interaction.reply({ content: "You can't challenge a bot.", ephemeral: true });
      return;
    }

    const game = newC4Game();
    const match: Match = {
      game,
      redUserId: interaction.user.id,
      yellowUserId: opponent.id,
      timeoutHandle: setTimeout(() => {}, 0),
    };

    const embed = buildEmbed(match);
    const reply = await interaction.reply({
      embeds: [embed],
      components: [buildColumnButtons(game)],
      withResponse: true,
    });

    const messageId = reply.resource?.message?.id;
    if (!messageId) return;

    const handle = setTimeout(async () => {
      const active = matches.get(messageId);
      if (!active || active.game.finished) return;
      matches.delete(messageId);
      active.game.finished = true;

      const timedOutId = currentPlayerId(active);
      const winnerId = timedOutId === active.redUserId ? active.yellowUserId : active.redUserId;
      const statusMsg = `⏱️ ${userTag(timedOutId)} ran out of time — ${userTag(winnerId)} wins!`;

      try {
        const msg = reply.resource?.message;
        if (msg) {
          await msg.edit({ embeds: [buildEmbed(active, statusMsg)], components: [] });
        }
      } catch {
        // message may have been deleted
      }
    }, TIMEOUT_MS);

    match.timeoutHandle = handle;
    matches.set(messageId, match);
  },
};
