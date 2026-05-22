import type { ActionsBlock, Block, Button, KnownBlock } from '@slack/types';

interface Poll {
  question: string;
  options: string[];
  votes: Map<string, number>; // userId -> optionIndex
  creatorId: string;
}

const polls = new Map<string, Poll>(); // messageTs -> poll

export interface ParsedPoll {
  kind: 'options' | 'yesno';
  question: string;
  options?: string[];
}

function splitOnPipe(text: string): string[] {
  // Split on `|` but ignore pipes inside Slack entity refs like `<@U123|alice>`.
  const parts: string[] = [];
  let buf = '';
  let depth = 0;
  for (const ch of text) {
    if (ch === '<') depth++;
    else if (ch === '>' && depth > 0) depth--;
    if (ch === '|' && depth === 0) {
      parts.push(buf);
      buf = '';
    } else {
      buf += ch;
    }
  }
  parts.push(buf);
  return parts;
}

export function parsePollInput(raw: string): ParsedPoll | { error: string } {
  const text = raw.trim();
  if (!text) return { error: 'Usage: `/poll <question>` or `/poll <question> | opt1 | opt2 | ...`' };

  const parts = splitOnPipe(text).map((p) => p.trim()).filter(Boolean);
  if (parts.length === 1) {
    return { kind: 'yesno', question: parts[0] };
  }

  const [question, ...options] = parts;
  if (!question) return { error: 'Question is empty.' };
  if (options.length < 2) return { error: 'Need at least two options (e.g. `Q | A | B`).' };
  if (options.length > 10) return { error: 'Max 10 options.' };
  return { kind: 'options', question, options };
}

export interface View {
  text: string;
  blocks: (Block | KnownBlock)[];
}

function tally(p: Poll): number[] {
  const counts = new Array(p.options.length).fill(0);
  for (const idx of p.votes.values()) counts[idx]++;
  return counts;
}

function bar(pct: number): string {
  const filled = Math.round(pct * 20);
  return '█'.repeat(filled) + '░'.repeat(20 - filled);
}

function renderPoll(p: Poll): View {
  const counts = tally(p);
  const total = counts.reduce((a, b) => a + b, 0);

  const blocks: (Block | KnownBlock)[] = [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*:bar_chart: ${p.question}*\nStarted by <@${p.creatorId}>` },
    },
  ];

  const resultLines = p.options.map((opt, i) => {
    const c = counts[i];
    const pct = total === 0 ? 0 : c / total;
    return `*${opt}*\n\`${bar(pct)}\` ${c} (${Math.round(pct * 100)}%)`;
  });
  blocks.push({ type: 'section', text: { type: 'mrkdwn', text: resultLines.join('\n\n') } });

  // Buttons, max 5 per actions block.
  for (let row = 0; row < p.options.length; row += 5) {
    const elements: Button[] = [];
    for (let i = row; i < Math.min(row + 5, p.options.length); i++) {
      elements.push({
        type: 'button',
        text: { type: 'plain_text', text: p.options[i].slice(0, 75), emoji: true },
        action_id: `poll_vote:${i}`,
        value: String(i),
      });
    }
    const actions: ActionsBlock = { type: 'actions', elements };
    blocks.push(actions);
  }

  blocks.push({
    type: 'context',
    elements: [{ type: 'mrkdwn', text: `${total} vote${total === 1 ? '' : 's'} · one vote per person, click again to change` }],
  });

  return { text: `Poll: ${p.question}`, blocks };
}

export function createPoll(question: string, options: string[], creatorId: string): View {
  const poll: Poll = { question, options, votes: new Map(), creatorId };
  // Stash with placeholder key until the message ts is known.
  return renderPoll(poll);
}

export function registerPoll(messageTs: string, question: string, options: string[], creatorId: string): void {
  polls.set(messageTs, { question, options, votes: new Map(), creatorId });
}

export function vote(messageTs: string, userId: string, optionIndex: number): View | null {
  const p = polls.get(messageTs);
  if (!p) return null;
  if (optionIndex < 0 || optionIndex >= p.options.length) return null;
  if (p.votes.get(userId) === optionIndex) {
    p.votes.delete(userId);
  } else {
    p.votes.set(userId, optionIndex);
  }
  return renderPoll(p);
}

export function yesNoText(question: string, creatorId: string): string {
  return `*:bar_chart: ${question}*\nStarted by <@${creatorId}> · react with :white_check_mark: or :x:`;
}

export const YESNO_REACTIONS: readonly string[] = ['white_check_mark', 'x'];
