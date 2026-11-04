import { SlashCommandBuilder } from 'discord.js';
import { logger } from '@bots/shared';
import type { Command } from './types.ts';
import { chat, OllamaError } from '../ollama/chat.ts';
import { AskLimiter } from '../ollama/limits.ts';
import { answerMessages, failPrivately } from '../ollama/reply.ts';
import { env } from '../env.ts';

const log = logger.scoped('ask');
const RESPONSE_TIMEOUT_MS = 60_000;
const limiter = new AskLimiter();

export const ask: Command = {
  // One option: every question goes to OLLAMA_MODEL, which keeps the quota predictable.
  data: new SlashCommandBuilder()
    .setName('ask')
    .setDescription('Ask an Ollama-hosted model a question')
    .addStringOption((o) =>
      o
        .setName('prompt')
        .setDescription('Your question or instruction')
        .setRequired(true)
        .setMaxLength(1500),
    ),
  async execute(interaction) {
    if (!env.OLLAMA_API_KEY) {
      await interaction.reply({
        content: 'Ask is not configured: `OLLAMA_API_KEY` is missing on the bot.',
        ephemeral: true,
      });
      return;
    }

    const prompt = interaction.options.getString('prompt', true);

    // Taken before the first await, so a burst of commands gets one through.
    const slot = limiter.claim(`${interaction.guildId ?? 'dm'}:${interaction.user.id}`);
    if (!slot.ok) {
      await interaction.reply({
        content:
          slot.reason === 'busy'
            ? 'Your last question is still being answered.'
            : `You're asking too fast. Wait ${slot.waitSeconds}s.`,
        ephemeral: true,
      });
      return;
    }

    try {
      await interaction.deferReply();

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), RESPONSE_TIMEOUT_MS);

      let answer: string;
      try {
        answer = await chat({
          model: env.OLLAMA_MODEL,
          messages: [{ role: 'user', content: prompt }],
          signal: controller.signal,
        });
      } catch (err) {
        const reason =
          err instanceof OllamaError
            ? err.message
            : controller.signal.aborted
              ? `Model took longer than ${RESPONSE_TIMEOUT_MS / 1000}s to respond.`
              : 'Unexpected error talking to Ollama.';
        // The channel no longer shows failures, so the log is where the owner finds them.
        log.warn(`/ask failed: ${reason}`, err instanceof OllamaError || controller.signal.aborted ? undefined : err);
        await failPrivately(interaction, `⚠️ ${reason}`, (deleteErr) =>
          log.error('Could not delete the deferred /ask reply', deleteErr),
        );
        return;
      } finally {
        clearTimeout(timer);
      }

      const [first, ...rest] = answerMessages(prompt, answer);
      await interaction.editReply(first);
      for (const extra of rest) await interaction.followUp(extra);
    } finally {
      slot.done();
    }
  },
};
