import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from 'discord.js';
import type { TriviaSession } from './session.ts';

const LABELS = ['A', 'B', 'C', 'D'];
const DIFFICULTY_COLOR: Record<string, number> = {
  easy:   0x57f287,
  medium: 0xfee75c,
  hard:   0xed4245,
};

export function buildEmbed(session: TriviaSession, footer?: string): EmbedBuilder {
  const color = DIFFICULTY_COLOR[session.difficulty] ?? 0x5865f2;
  const optionLines = session.options.map((opt, i) => `**${LABELS[i]}**: ${opt}`).join('\n');
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle('Trivia')
    .setDescription(`${session.question}\n\n${optionLines}`)
    .setFooter({ text: footer ?? `Category: ${session.category} · Difficulty: ${session.difficulty} · 20 seconds` });
  return embed;
}

export function buildButtons(
  sessionId: string,
  disabled: boolean,
  correctIdx?: number,
): ActionRowBuilder<ButtonBuilder> {
  const row = new ActionRowBuilder<ButtonBuilder>();
  for (let i = 0; i < 4; i++) {
    const btn = new ButtonBuilder()
      .setCustomId(`trv:${sessionId}:${i}`)
      .setLabel(LABELS[i])
      .setDisabled(disabled);

    if (disabled && correctIdx !== undefined) {
      btn.setStyle(i === correctIdx ? ButtonStyle.Success : ButtonStyle.Secondary);
    } else {
      btn.setStyle(ButtonStyle.Primary);
    }

    row.addComponents(btn);
  }
  return row;
}
