import type { WebClient } from '@slack/web-api';
import {
  applyGuess,
  Game,
  isValidWord,
  MAX_ATTEMPTS,
  newGame,
  renderBoard,
  renderRow,
  WORD_LENGTH,
} from './game.ts';

interface ThreadGame {
  game: Game;
  channelId: string;
  threadTs: string;
}

const games = new Map<string, ThreadGame>();

function key(channel: string, thread: string): string {
  return `${channel}:${thread}`;
}

export interface StartArgs {
  client: WebClient;
  channelId: string;
  userId: string;
}

export async function startWordle({ client, channelId, userId }: StartArgs): Promise<string> {
  const intro = await client.chat.postMessage({
    channel: channelId,
    text: `:large_green_square: *Wordle* started by <@${userId}>. Guess in this thread by *@mentioning me* with your word.`,
  });
  const threadTs = intro.ts!;
  const game = newGame(userId);
  games.set(key(channelId, threadTs), { game, channelId, threadTs });

  await client.chat.postMessage({
    channel: channelId,
    thread_ts: threadTs,
    text: [
      `Guess the *${WORD_LENGTH}*-letter word. You have *${MAX_ATTEMPTS}* attempts.`,
      ':large_green_square: right letter, right spot · :large_yellow_square: right letter, wrong spot · :black_large_square: not in word',
      'Reply by `@mention`-ing me with a 5-letter word, e.g. `@bot apple`.',
    ].join('\n'),
  });

  return threadTs;
}

export interface GuessArgs {
  client: WebClient;
  channelId: string;
  threadTs: string;
  userId: string;
  text: string;
}

export async function handleWordleGuess({
  client,
  channelId,
  threadTs,
  userId,
  text,
}: GuessArgs): Promise<boolean> {
  const entry = games.get(key(channelId, threadTs));
  if (!entry) return false;
  const { game } = entry;

  const content = text.trim().toLowerCase();
  if (!content) return true;

  if (game.finished) {
    await client.chat.postMessage({
      channel: channelId,
      thread_ts: threadTs,
      text: 'This game is finished.',
    });
    return true;
  }

  if (!/^[a-z]+$/.test(content)) {
    await client.chat.postMessage({
      channel: channelId,
      thread_ts: threadTs,
      text: 'Guesses must be letters only.',
    });
    return true;
  }
  if (content.length !== WORD_LENGTH) {
    await client.chat.postMessage({
      channel: channelId,
      thread_ts: threadTs,
      text: `Guesses must be exactly ${WORD_LENGTH} letters.`,
    });
    return true;
  }
  if (!isValidWord(content)) {
    await client.chat.postMessage({
      channel: channelId,
      thread_ts: threadTs,
      text: `\`${content.toUpperCase()}\` is not in my word list.`,
    });
    return true;
  }

  const result = applyGuess(game, content);
  const remaining = MAX_ATTEMPTS - game.guesses.length;

  const lines: string[] = [renderRow(result)];
  if (game.won) {
    lines.push('', `:tada: Solved in ${game.guesses.length}/${MAX_ATTEMPTS}! Posting result to the channel.`);
  } else if (game.finished) {
    lines.push('', `:skull: Out of guesses. The word was *${game.target.toUpperCase()}*.`);
  } else {
    lines.push('', `Guess ${game.guesses.length}/${MAX_ATTEMPTS} — *${remaining}* left.`);
  }

  await client.chat.postMessage({
    channel: channelId,
    thread_ts: threadTs,
    text: lines.join('\n'),
  });

  if (game.finished) {
    const starter = `<@${game.starterId}>`;
    const header = game.won
      ? `:tada: ${starter} solved Wordle in *${game.guesses.length}/${MAX_ATTEMPTS}*!`
      : `:skull: ${starter} ran out of guesses. The word was *${game.target.toUpperCase()}*.`;
    await client.chat.postMessage({
      channel: channelId,
      text: [header, renderBoard(game)].join('\n'),
    });
    games.delete(key(channelId, threadTs));
  }
  // Acknowledge regardless of who sent it — we accept guesses from anyone in the thread.
  void userId;
  return true;
}

export function hasWordleGame(channelId: string, threadTs: string): boolean {
  return games.has(key(channelId, threadTs));
}
