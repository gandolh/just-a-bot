import {
  ButtonInteraction,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from 'discord.js';
import { fetchQuestion, CATEGORIES } from '../trivia/api.ts';
import { sessions } from '../trivia/session.ts';
import { buildEmbed, buildButtons } from '../trivia/render.ts';
import type { Command } from './types.ts';

const TIMEOUT_MS = 20_000;

async function expireSession(sessionId: string): Promise<void> {
  const session = sessions.get(sessionId);
  if (!session) return;
  sessions.delete(sessionId);
  if (session.winner !== null) return;

  const correctAnswer = session.options[session.correctIdx];
  const embed = buildEmbed(session, `⏱️ Time's up — the answer was: **${correctAnswer}**`);
  const row = buildButtons(sessionId, true, session.correctIdx);

  await session.interaction.editReply({ embeds: [embed], components: [row] }).catch(() => {});
}

export async function handleTriviaButton(interaction: ButtonInteraction): Promise<void> {
  const parts = interaction.customId.split(':');
  const sessionId = parts[1];
  const chosenIdx = parseInt(parts[2], 10);

  const session = sessions.get(sessionId);
  if (!session) {
    await interaction.reply({ content: 'This trivia session has expired.', ephemeral: true });
    return;
  }

  const now = Date.now();
  if (session.winner !== null || now > session.expiresAt) {
    await interaction.reply({ content: '⏱️ Too late! This round is already over.', ephemeral: true });
    return;
  }

  if (chosenIdx === session.correctIdx) {
    session.winner = interaction.user.id;
    sessions.delete(sessionId);

    const embed = buildEmbed(session, `🏆 <@${interaction.user.id}> got it!`);
    const row = buildButtons(sessionId, true, session.correctIdx);
    await interaction.update({ embeds: [embed], components: [row] });
  } else {
    await interaction.reply({ content: 'Not quite. Try again.', ephemeral: true });
  }
}

export const trivia: Command = {
  data: new SlashCommandBuilder()
    .setName('trivia')
    .setDescription('Start a multiple-choice trivia question')
    .addStringOption((opt) =>
      opt
        .setName('category')
        .setDescription('Question category')
        .setRequired(false)
        .addChoices(
          ...Object.entries(CATEGORIES).map(([value, { label }]) => ({ name: label, value })),
        ),
    )
    .addStringOption((opt) =>
      opt
        .setName('difficulty')
        .setDescription('Question difficulty')
        .setRequired(false)
        .addChoices(
          { name: 'Easy',   value: 'easy' },
          { name: 'Medium', value: 'medium' },
          { name: 'Hard',   value: 'hard' },
        ),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const category   = interaction.options.getString('category')   ?? undefined;
    const difficulty = interaction.options.getString('difficulty') ?? undefined;

    await interaction.deferReply();

    const q = await fetchQuestion(category, difficulty);

    const id = crypto.randomUUID().slice(0, 8);
    const now = Date.now();

    const session = {
      id,
      channelId: interaction.channelId,
      messageId: '',
      question: q.question,
      options: q.options,
      correctIdx: q.correctIdx,
      category: q.category,
      difficulty: q.difficulty,
      startedAt: now,
      expiresAt: now + TIMEOUT_MS,
      winner: null,
      interaction,
    };

    sessions.set(id, session);

    const embed = buildEmbed(session);
    const row = buildButtons(id, false);

    const reply = await interaction.editReply({ embeds: [embed], components: [row] });
    session.messageId = reply.id;

    setTimeout(() => void expireSession(id), TIMEOUT_MS);
  },
};
