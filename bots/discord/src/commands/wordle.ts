import {
  ChannelType,
  ChatInputCommandInteraction,
  Message,
  SlashCommandBuilder,
  ThreadAutoArchiveDuration,
} from 'discord.js';
import {
  applyGuess,
  Game,
  isValidWord,
  MAX_ATTEMPTS,
  newGame,
  renderRow,
  WORD_LENGTH,
} from '../wordle/game.ts';
import type { Command } from './types.ts';

interface ThreadGame {
  game: Game;
  parentChannelId: string;
}

const games = new Map<string, ThreadGame>();

export function hasWordleGame(threadId: string): boolean {
  return games.has(threadId);
}

function renderBoard(game: Game): string {
  return game.guesses.map(renderRow).join('\n');
}

async function postResultToParent(
  message: Message,
  entry: ThreadGame,
): Promise<void> {
  const { game, parentChannelId } = entry;
  const channel = await message.client.channels.fetch(parentChannelId).catch(() => null);
  if (!channel || !channel.isTextBased() || !('send' in channel)) return;

  const starter = `<@${game.starterId}>`;
  const header = game.won
    ? `🎉 ${starter} solved Wordle in **${game.guesses.length}/${MAX_ATTEMPTS}**!`
    : `💀 ${starter} ran out of guesses. The word was **${game.target.toUpperCase()}**.`;

  await channel
    .send([header, renderBoard(game)].join('\n'))
    .catch(() => {});
}

async function endGame(message: Message, entry: ThreadGame): Promise<void> {
  await postResultToParent(message, entry);
  games.delete(message.channelId);
  if (message.channel.isThread()) {
    await message.channel.delete('Wordle game finished').catch(() => {});
  }
}

export async function handleWordleMessage(message: Message): Promise<void> {
  const entry = games.get(message.channelId);
  if (!entry) return;
  const { game } = entry;

  const content = message.content.trim().toLowerCase();
  if (!content) return;

  if (content === 'delete') {
    if (message.author.id !== game.starterId && !game.finished) {
      await message.reply('Only the player who started this game can delete it.');
      return;
    }
    if (!message.channel.isThread()) return;
    try {
      await message.channel.delete('Wordle game deleted by player');
      games.delete(message.channelId);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      await message
        .reply(`Couldn't delete this thread — I'm probably missing the **Manage Threads** permission.\n\`${reason}\``)
        .catch(() => {});
    }
    return;
  }

  if (game.finished) return;

  if (!/^[a-z]+$/.test(content)) {
    await message.reply('Guesses must be letters only.');
    return;
  }
  if (content.length !== WORD_LENGTH) {
    await message.reply(`Guesses must be exactly ${WORD_LENGTH} letters.`);
    return;
  }
  if (!isValidWord(content)) {
    await message.reply(`\`${content.toUpperCase()}\` is not in my word list.`);
    return;
  }

  const result = applyGuess(game, content);
  const remaining = MAX_ATTEMPTS - game.guesses.length;

  const lines: string[] = [renderRow(result)];
  if (game.won) {
    lines.push('', `🎉 Solved in ${game.guesses.length}/${MAX_ATTEMPTS}! Posting result to the channel and closing this thread…`);
  } else if (game.finished) {
    lines.push('', `💀 Out of guesses. The word was **${game.target.toUpperCase()}**. Posting result to the channel and closing this thread…`);
  } else {
    lines.push('', `Guess ${game.guesses.length}/${MAX_ATTEMPTS} — **${remaining}** left.`);
  }

  await message.reply(lines.join('\n')).catch(() => {});

  if (game.finished) {
    await endGame(message, entry);
  }
}

export const wordle: Command = {
  data: new SlashCommandBuilder()
    .setName('wordle')
    .setDescription('Start a Wordle game in a new thread'),
  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.channel || interaction.channel.type !== ChannelType.GuildText) {
      await interaction.reply({
        content: 'Wordle can only be started in a regular text channel.',
        ephemeral: true,
      });
      return;
    }

    await interaction.reply(`🟩 **Wordle** started by ${interaction.user}. See the thread below.`);
    const replyMessage = await interaction.fetchReply();

    const thread = await replyMessage.startThread({
      name: `Wordle - ${interaction.user.username}`,
      autoArchiveDuration: ThreadAutoArchiveDuration.OneDay,
    });

    const game = newGame(interaction.user.id);
    games.set(thread.id, { game, parentChannelId: interaction.channelId });

    await thread.send(
      [
        `Guess the ${WORD_LENGTH}-letter word. You have **${MAX_ATTEMPTS}** attempts.`,
        '🟩 = right letter, right spot · 🟨 = right letter, wrong spot · ⬛ = not in word',
        'Type your guess in this thread. Type `delete` to remove the thread early — otherwise it closes automatically when the game ends and the result is posted in the channel.',
      ].join('\n'),
    );
  },
};
