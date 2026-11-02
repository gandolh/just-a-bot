import { SlashCommandBuilder } from 'discord.js';
import type { Command } from './types.ts';
import { chat, OllamaError } from '../ollama/chat.ts';
import { AskLimiter, allowedModels, pickModel } from '../ollama/limits.ts';
import { answerMessages } from '../ollama/reply.ts';
import { env } from '../env.ts';

const RESPONSE_TIMEOUT_MS = 60_000;

/**
 * The models a member may pick. Any name used to go to Ollama on the owner's
 * key; now the option offers these as choices, and `execute` refuses anything
 * else (a stale registration, a hand-made request).
 */
const MODELS = allowedModels(env.OLLAMA_MODEL, env.OLLAMA_MODELS);
const limiter = new AskLimiter();

export const ask: Command = {
  data: new SlashCommandBuilder()
    .setName('ask')
    .setDescription('Ask an Ollama-hosted model a question')
    .addStringOption((o) =>
      o
        .setName('prompt')
        .setDescription('Your question or instruction')
        .setRequired(true)
        .setMaxLength(1500),
    )
    .addStringOption((o) =>
      o
        .setName('model')
        .setDescription(`The model to ask (default: ${env.OLLAMA_MODEL})`.slice(0, 100))
        .addChoices(...MODELS.map((name) => ({ name, value: name }))),
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
    const requested = interaction.options.getString('model');
    const model = pickModel(requested, MODELS, env.OLLAMA_MODEL);
    if (!model) {
      await interaction.reply({ content: "That model isn't one of the models offered here.", ephemeral: true });
      return;
    }

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
          model,
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
        await interaction.editReply(`⚠️ ${reason}`);
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
