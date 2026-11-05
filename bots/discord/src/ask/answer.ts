/**
 * One `/ask` question through Wicket, from the deferred reply to the answer.
 * No env and no discord.js here: the interaction and the client come in, so
 * the whole flow is tested against stubs.
 */

import { MAX_WAIT_SECONDS, WicketError, type WicketClient, type WicketJob } from '../wicket/client.ts';
import { answerMessages, failPrivately } from './reply.ts';

/**
 * Discord lets a bot edit or follow up an interaction for 15 minutes. A
 * question still waiting at 14 is withdrawn, with a minute left to say so.
 */
export const ASK_DEADLINE_MS = 14 * 60_000;

/** The calls `/ask` makes on its interaction after deferring the reply. */
export interface AskInteraction {
  editReply(content: string): Promise<unknown>;
  followUp(options: string | { content: string; ephemeral: true }): Promise<unknown>;
  deleteReply(): Promise<unknown>;
}

export type AskOutcome =
  | { outcome: 'answered'; model: string }
  | { outcome: 'failed' | 'cancelled' | 'expired' | 'lost'; reason: string };

/** What the deferred reply says while the job is not finished. */
export function queueLine(job: WicketJob): string {
  return job.status === 'running' ? 'Thinking…' : `You're number ${job.ticket} · now serving ${job.nowServing}`;
}

/**
 * Send the prompt to Wicket and keep the deferred reply in step with the
 * queue: the ticket line while it waits, edited only when the line changes,
 * "Thinking…" while it runs, then the answer in place of both. A failure,
 * a cancel (the owner cleared or force-closed it in Wicket), a job Wicket
 * forgot, or a question still waiting at `deadline` ends on the private
 * failure path: the public placeholder goes and only the member is told.
 * At the deadline the job is withdrawn first, so it doesn't run for nobody.
 */
export async function answerThroughWicket({
  interaction,
  client,
  prompt,
  deadline,
  now = Date.now,
  onDeleteError,
}: {
  interaction: AskInteraction;
  client: WicketClient;
  prompt: string;
  /** Epoch ms after which the question is withdrawn. */
  deadline: number;
  now?: () => number;
  onDeleteError?: (err: unknown) => void;
}): Promise<AskOutcome> {
  const fail = async (outcome: Exclude<AskOutcome['outcome'], 'answered'>, reason: string): Promise<AskOutcome> => {
    await failPrivately(interaction, `⚠️ ${reason}`, onDeleteError);
    return { outcome, reason };
  };

  let job: WicketJob;
  try {
    job = await client.submit([{ role: 'user', content: prompt }]);
  } catch (err) {
    if (!(err instanceof WicketError)) throw err;
    return fail('failed', err.message);
  }

  let shown: string | undefined;
  try {
    for (;;) {
      if (job.status === 'done') {
        if (!job.result?.text) return fail('failed', 'Wicket finished without an answer.');
        const [first, ...rest] = answerMessages(prompt, job.result.text);
        await interaction.editReply(first);
        for (const extra of rest) await interaction.followUp(extra);
        return { outcome: 'answered', model: job.result.model };
      }
      if (job.status === 'failed') return fail('failed', `The model failed: ${job.error ?? 'no reason given'}.`);
      if (job.status === 'cancelled') {
        return fail('cancelled', `Your question was cancelled: ${job.error ?? 'no reason given'}.`);
      }

      const line = queueLine(job);
      if (line !== shown) {
        await interaction.editReply(line);
        shown = line;
      }

      const left = deadline - now();
      if (left <= 0) {
        await client.cancel(job.id).catch(() => {});
        return fail('expired', 'Your question waited too long in the queue, so it was withdrawn. Ask again later.');
      }

      const next = await client.get(job.id, Math.min(MAX_WAIT_SECONDS, Math.ceil(left / 1000)));
      if (!next) return fail('lost', 'Wicket lost your question (it restarted). Ask again.');
      job = next;
    }
  } catch (err) {
    // Wicket or Discord went away mid-wait: withdraw the job either way.
    await client.cancel(job.id).catch(() => {});
    if (!(err instanceof WicketError)) throw err;
    return fail('failed', err.message);
  }
}
