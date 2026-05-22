import { SlashCommandBuilder } from 'discord.js';
import type { Command } from './types.ts';
import { chat, OllamaError } from '../ollama/chat.ts';
import { env } from '../env.ts';

const DISCORD_MESSAGE_LIMIT = 2000;
const RESPONSE_TIMEOUT_MS = 60_000;

function splitForDiscord(text: string): string[] {
  if (text.length <= DISCORD_MESSAGE_LIMIT) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > DISCORD_MESSAGE_LIMIT) {
    const slice = remaining.slice(0, DISCORD_MESSAGE_LIMIT);
    const breakAt = Math.max(slice.lastIndexOf('\n\n'), slice.lastIndexOf('\n'), slice.lastIndexOf(' '));
    const cut = breakAt > DISCORD_MESSAGE_LIMIT * 0.5 ? breakAt : DISCORD_MESSAGE_LIMIT;
    chunks.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut).trimStart();
  }
  if (remaining.length) chunks.push(remaining);
  return chunks;
}

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
        .setDescription(`Override the default model (default: ${env.OLLAMA_MODEL})`)
        .setMaxLength(100),
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
    const model = interaction.options.getString('model') ?? undefined;

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

    const header = `> ${prompt.length > 200 ? prompt.slice(0, 197) + '…' : prompt}`;
    const first = `${header}\n\n${answer}`;
    const chunks = splitForDiscord(first);

    await interaction.editReply(chunks[0]);
    for (const extra of chunks.slice(1)) {
      await interaction.followUp(extra);
    }
  },
};
