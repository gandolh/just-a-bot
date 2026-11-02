/** How `/ask` turns an answer into Discord messages. No env here, so it is tested on its own. */

export const DISCORD_MESSAGE_LIMIT = 2000;
/** The reply plus two follow-ups. A longer answer is cut, and says so. */
export const MAX_ANSWER_MESSAGES = 3;
export const CUT_NOTE = '\n\n*(Answer cut: it ran past three messages.)*';

/** Split text into messages of at most 2000 characters, at a paragraph, line or word break where one is near. */
export function splitForDiscord(text: string, limit = DISCORD_MESSAGE_LIMIT): string[] {
  if (text.length <= limit) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > limit) {
    const slice = remaining.slice(0, limit);
    const breakAt = Math.max(slice.lastIndexOf('\n\n'), slice.lastIndexOf('\n'), slice.lastIndexOf(' '));
    const cut = breakAt > limit * 0.5 ? breakAt : limit;
    chunks.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut).trimStart();
  }
  if (remaining.length) chunks.push(remaining);
  return chunks;
}

/**
 * The messages for one answer: the quoted prompt and the answer, split, and
 * at most `MAX_ANSWER_MESSAGES` of them. Every answer used to be posted in
 * full, one public follow-up per 2000 characters, so one long answer could
 * fill the channel. When it is cut, the last message ends with `CUT_NOTE`.
 */
export function answerMessages(prompt: string, answer: string): string[] {
  const header = `> ${prompt.length > 200 ? prompt.slice(0, 197) + '…' : prompt}`;
  const chunks = splitForDiscord(`${header}\n\n${answer}`);
  if (chunks.length <= MAX_ANSWER_MESSAGES) return chunks;
  const kept = chunks.slice(0, MAX_ANSWER_MESSAGES);
  const last = kept[MAX_ANSWER_MESSAGES - 1];
  kept[MAX_ANSWER_MESSAGES - 1] = `${last.slice(0, DISCORD_MESSAGE_LIMIT - CUT_NOTE.length).trimEnd()}${CUT_NOTE}`;
  return kept;
}
