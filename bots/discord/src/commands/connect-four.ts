import {
  ButtonInteraction,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from 'discord.js';
import { dropDisc, newC4Game } from '../connect-four/game.ts';
import { chooseMove } from '../connect-four/ai.ts';
import {
  type Match,
  buildColumnButtons,
  buildEmbed,
  currentPlayerId,
  sideLabel,
} from '../connect-four/view.ts';
import type { Command } from './types.ts';

const TIMEOUT_MS = 90_000;

/** Shared across /c4 (solo) and /c42 (PvP) — keyed by message id. */
const matches = new Map<string, Match>();

/** Bot is always Yellow in solo mode. */
const BOT_ID = 'bot';

function finalize(messageId: string, match: Match): void {
  clearTimeout(match.timeoutHandle);
  matches.delete(messageId);
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

  // Solo mode: after the human moves and the game continues, let the bot reply.
  if (match.vsBot && !match.game.finished && match.game.turn === 'Y') {
    const botCol = chooseMove(match.game);
    if (botCol >= 0) dropDisc(match.game, botCol);
  }

  if (match.game.finished) finalize(interaction.message.id, match);

  const embed = buildEmbed(match);
  const components = match.game.finished ? [] : buildColumnButtons(match.game);
  await interaction.update({ embeds: [embed], components });
}

/**
 * Shared setup: send the initial board, register the match, and arm a turn timer.
 * For solo mode, `redUserId` is the human and `yellowUserId` is the bot sentinel.
 */
async function startMatch(
  interaction: ChatInputCommandInteraction,
  redUserId: string,
  yellowUserId: string,
  vsBot: boolean,
): Promise<void> {
  const game = newC4Game();
  const match: Match = {
    game,
    redUserId,
    yellowUserId,
    vsBot,
    timeoutHandle: setTimeout(() => {}, 0),
  };

  const embed = buildEmbed(match);
  const reply = await interaction.reply({
    embeds: [embed],
    components: buildColumnButtons(game),
    withResponse: true,
  });

  const messageId = reply.resource?.message?.id;
  if (!messageId) return;

  const handle = setTimeout(async () => {
    const active = matches.get(messageId);
    if (!active || active.game.finished) return;
    matches.delete(messageId);
    active.game.finished = true;

    const timedOutDisc = active.game.turn;
    const timedOut = sideLabel(active, timedOutDisc);
    const winner = sideLabel(active, timedOutDisc === 'R' ? 'Y' : 'R');
    const statusMsg = `⏱️ ${timedOut} ran out of time — ${winner} wins!`;

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
}

export const connectFour: Command = {
  data: new SlashCommandBuilder()
    .setName('c4')
    .setDescription('Play Connect Four against the bot'),

  async execute(interaction: ChatInputCommandInteraction) {
    // Human is Red and moves first; bot is Yellow.
    await startMatch(interaction, interaction.user.id, BOT_ID, true);
  },
};

export const connectFour2: Command = {
  data: new SlashCommandBuilder()
    .setName('c42')
    .setDescription('Challenge someone to a game of Connect Four')
    .addUserOption((opt) =>
      opt.setName('opponent').setDescription('The user you want to challenge').setRequired(true),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const opponent = interaction.options.getUser('opponent', true);

    if (opponent.id === interaction.user.id) {
      await interaction.reply({ content: "You can't challenge yourself.", ephemeral: true });
      return;
    }
    if (opponent.bot) {
      await interaction.reply({ content: "You can't challenge a bot. Use /c4 to play the bot.", ephemeral: true });
      return;
    }

    await startMatch(interaction, interaction.user.id, opponent.id, false);
  },
};
