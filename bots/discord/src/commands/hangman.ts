import {
  ChannelType,
  ChatInputCommandInteraction,
  Message,
  SlashCommandBuilder,
  ThreadAutoArchiveDuration,
} from 'discord.js';
import {
  applyGuess,
  games,
  hasHangmanGame,
  newGame,
  resolveCategory,
} from '../hangman/game.ts';
import { renderState } from '../hangman/render.ts';
import { ALL_CATEGORIES } from '../hangman/words.ts';
import type { Command } from './types.ts';

export { hasHangmanGame };

export async function handleHangmanMessage(message: Message): Promise<void> {
  const game = games.get(message.channelId);
  if (!game || game.state !== 'active') return;

  const content = message.content.trim().toLowerCase();

  if (!/^[a-z]$/.test(content)) return;

  const outcome = applyGuess(game, content);

  if (outcome.kind === 'already_guessed') {
    await message.react('🔁').catch(() => {});
    return;
  }

  if (outcome.kind === 'correct') {
    await message.react('✅').catch(() => {});
    await message.reply(renderState(game)).catch(() => {});
    return;
  }

  if (outcome.kind === 'wrong') {
    await message.react('❌').catch(() => {});
    await message.reply(renderState(game)).catch(() => {});
    return;
  }

  if (outcome.kind === 'won') {
    await message.react('🎉').catch(() => {});
    const finalRender = renderState(game);
    await message
      .reply(`${finalRender}\n\n🎉 <@${game.starterId}>'s team got it! The word was **${game.word}**.`)
      .catch(() => {});
    await archiveThread(message);
    return;
  }

  if (outcome.kind === 'lost') {
    // Reveal the full word in revealed before final render
    game.revealed = game.word.split('');
    const finalRender = renderState(game);
    await message
      .reply(`${finalRender}\n\n💀 Game over! The word was **${game.word}**.`)
      .catch(() => {});
    await archiveThread(message);
    return;
  }
}

async function archiveThread(message: Message): Promise<void> {
  games.delete(message.channelId);
  if (message.channel.isThread()) {
    await message.channel.setArchived(true, 'Hangman game finished').catch(() => {});
  }
}

export const hangman: Command = {
  data: new SlashCommandBuilder()
    .setName('hangman')
    .setDescription('Play a game of Hangman in a thread')
    .addSubcommand((sub) =>
      sub
        .setName('start')
        .setDescription('Start a new Hangman game')
        .addStringOption((opt) =>
          opt
            .setName('category')
            .setDescription('Word category')
            .addChoices(
              ...ALL_CATEGORIES.map((c) => ({ name: c, value: c })),
            )
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('give-up')
        .setDescription('Reveal the word and end the current game (starter or admin only)'),
    ) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'start') {
      await handleStart(interaction);
    } else if (sub === 'give-up') {
      await handleGiveUp(interaction);
    }
  },
};

async function handleStart(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.channel || interaction.channel.type !== ChannelType.GuildText) {
    await interaction.reply({
      content: 'Hangman can only be started in a regular text channel.',
      ephemeral: true,
    });
    return;
  }

  const categoryInput = interaction.options.getString('category') ?? undefined;
  const category = resolveCategory(categoryInput);

  await interaction.reply({
    content: `🎯 **Hangman** started by ${interaction.user} (category: **${category}**). See the thread below.`,
  });

  const replyMessage = await interaction.fetchReply();
  const thread = await replyMessage.startThread({
    name: `hangman-${category}`,
    autoArchiveDuration: ThreadAutoArchiveDuration.OneHour,
  });

  const game = newGame(thread.id, interaction.channelId, interaction.user.id, category);
  games.set(thread.id, game);

  const initialState = renderState(game);
  await thread.send(
    [
      `Guess letters one at a time by typing a single letter in this thread.`,
      `6 wrong guesses and it's game over. Type \`/hangman give-up\` to reveal the word early.`,
      '',
      initialState,
    ].join('\n'),
  );
}

async function handleGiveUp(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.channel?.isThread()) {
    await interaction.reply({
      content: 'Use this command inside the Hangman thread.',
      ephemeral: true,
    });
    return;
  }

  const game = games.get(interaction.channelId);
  if (!game) {
    await interaction.reply({
      content: 'There is no active Hangman game in this thread.',
      ephemeral: true,
    });
    return;
  }

  const member = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
  const isAdmin = member?.permissions.has('Administrator') ?? false;

  if (interaction.user.id !== game.starterId && !isAdmin) {
    await interaction.reply({
      content: 'Only the player who started this game (or an admin) can give up.',
      ephemeral: true,
    });
    return;
  }

  game.revealed = game.word.split('');
  game.state = 'lost';
  const finalRender = renderState(game);

  await interaction.reply(
    `${finalRender}\n\n🏳️ <@${game.starterId}> gave up. The word was **${game.word}**.`,
  );

  games.delete(interaction.channelId);
  await interaction.channel.setArchived(true, 'Hangman game ended (give-up)').catch(() => {});
}
