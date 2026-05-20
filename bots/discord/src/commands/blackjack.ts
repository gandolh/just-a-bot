import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import {
  doubleDown,
  finishWithDealer,
  Game,
  handValue,
  hit,
  isBlackjack,
  newGame,
  renderHand,
  settle,
} from '../gambling/blackjack.ts';
import { getBalance, tryDebit } from '../gambling/wallet.ts';
import type { Command } from './types.ts';

function buttons(disabled: boolean, canDouble: boolean): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('bj:hit')
      .setLabel('Hit')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId('bj:stand')
      .setLabel('Stand')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId('bj:double')
      .setLabel('Double')
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled || !canDouble),
  );
}

function gameView(game: Game, opts: { reveal: boolean; status?: string }): {
  content: string;
  components: ActionRowBuilder<ButtonBuilder>[];
} {
  const playerVal = handValue(game.player);
  const dealerShown = opts.reveal ? handValue(game.dealer).total : '?';
  const lines = [
    `**Blackjack** — bet: **${game.bet.toLocaleString()}**${game.doubled ? ' (doubled)' : ''}`,
    `Dealer: ${renderHand(game.dealer, !opts.reveal)}  (${dealerShown})`,
    `You:    ${renderHand(game.player)}  (${playerVal.total}${playerVal.soft ? ' soft' : ''})`,
  ];
  if (opts.status) lines.push('', opts.status);
  const canDouble = game.player.length === 2 && !game.doubled;
  return {
    content: lines.join('\n'),
    components: [buttons(game.finished, canDouble)],
  };
}

const games = new Map<string, Game>();

export async function handleBlackjackButton(interaction: ButtonInteraction): Promise<void> {
  const game = games.get(interaction.message.id);
  if (!game) {
    await interaction.reply({ content: 'This game has expired.', ephemeral: true });
    return;
  }
  if (interaction.user.id !== game.userId) {
    await interaction.reply({ content: 'This is not your game.', ephemeral: true });
    return;
  }
  if (game.finished) {
    await interaction.reply({ content: 'Game already finished.', ephemeral: true });
    return;
  }

  const action = interaction.customId.split(':')[1];
  let status: string | undefined;
  let reveal = false;

  if (action === 'hit') {
    const v = hit(game);
    if (v > 21) {
      reveal = true;
      status = await settle(game, 'player-bust');
    } else if (v === 21) {
      status = await finishWithDealer(game);
      reveal = true;
    }
  } else if (action === 'stand') {
    status = await finishWithDealer(game);
    reveal = true;
  } else if (action === 'double') {
    if (game.player.length !== 2 || game.doubled) {
      await interaction.reply({ content: 'You can only double on your first action.', ephemeral: true });
      return;
    }
    const ok = await doubleDown(game);
    if (!ok) {
      await interaction.reply({ content: 'Not enough coins to double.', ephemeral: true });
      return;
    }
    const v = handValue(game.player).total;
    if (v > 21) {
      reveal = true;
      status = await settle(game, 'player-bust');
    } else {
      status = await finishWithDealer(game);
      reveal = true;
    }
  }

  if (game.finished) games.delete(interaction.message.id);

  const view = gameView(game, { reveal, status });
  await interaction.update({ content: view.content, components: view.components });
}

export const blackjack: Command = {
  data: new SlashCommandBuilder()
    .setName('blackjack')
    .setDescription('Play a hand of blackjack')
    .addIntegerOption((opt) =>
      opt
        .setName('bet')
        .setDescription('Coins to wager')
        .setRequired(true)
        .setMinValue(1),
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    const bet = interaction.options.getInteger('bet', true);
    const userId = interaction.user.id;

    const ok = await tryDebit(userId, bet);
    if (!ok) {
      const balance = await getBalance(userId);
      await interaction.reply({
        content: `Not enough coins. You have **${balance.toLocaleString()}**, tried to bet **${bet.toLocaleString()}**.`,
        ephemeral: true,
      });
      return;
    }

    const game = newGame(userId, bet);

    const playerBJ = isBlackjack(game.player);
    const dealerBJ = isBlackjack(game.dealer);

    if (playerBJ || dealerBJ) {
      game.finished = true;
      let status: string;
      if (playerBJ && dealerBJ) status = await settle(game, 'push');
      else if (playerBJ) status = await settle(game, 'blackjack');
      else status = await settle(game, 'dealer-win');
      const view = gameView(game, { reveal: true, status });
      await interaction.reply({ content: view.content, components: view.components });
      return;
    }

    const view = gameView(game, { reveal: false });
    const reply = await interaction.reply({
      content: view.content,
      components: view.components,
      withResponse: true,
    });
    const messageId = reply.resource?.message?.id;
    if (messageId) games.set(messageId, game);
  },
};

void MessageFlags;
