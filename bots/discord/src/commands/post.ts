import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from 'discord.js';
import { logger } from '@bots/shared';
import type { Command } from './types.ts';
import { env } from '../env.ts';
import { renderToPng } from '../img/render.ts';
import { pngAttachment } from '../img/attach.ts';
import { memeSquareTemplate } from '../img/templates/meme-square.ts';
import { cardSquareTemplate } from '../img/templates/card-square.ts';
import { postImage } from '../instagram/client.ts';

const log = logger.scoped('post');
const SIZE = 1080;

interface PendingPost {
  ownerId: string;
  caption: string;
  createdAt: number;
}

const pending = new Map<string, PendingPost>();
const PENDING_TTL_MS = 30 * 60_000;

function newApprovalId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function sweepExpired(): void {
  const cutoff = Date.now() - PENDING_TTL_MS;
  for (const [id, p] of pending) {
    if (p.createdAt < cutoff) pending.delete(id);
  }
}

const data = new SlashCommandBuilder()
  .setName('post')
  .setDescription('Render an image and post it to Instagram (with approval)')
  .addSubcommand((s) =>
    s
      .setName('meme')
      .setDescription('Classic top/bottom-text meme (1080×1080)')
      .addStringOption((o) =>
        o.setName('top').setDescription('Top caption').setRequired(true).setMaxLength(120),
      )
      .addStringOption((o) =>
        o.setName('bottom').setDescription('Bottom caption').setRequired(true).setMaxLength(120),
      )
      .addStringOption((o) =>
        o.setName('caption').setDescription('Instagram caption').setRequired(true).setMaxLength(2200),
      )
      .addStringOption((o) =>
        o
          .setName('template')
          .setDescription('Meme template (default: classic)')
          .addChoices(
            { name: 'classic', value: 'classic' },
            { name: 'bonk', value: 'bonk' },
            { name: 'disaster-girl', value: 'disaster-girl' },
          ),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('card')
      .setDescription('Announcement/quote card (1080×1080)')
      .addStringOption((o) =>
        o.setName('title').setDescription('Card title').setRequired(true).setMaxLength(120),
      )
      .addStringOption((o) =>
        o.setName('body').setDescription('Card body').setRequired(true).setMaxLength(300),
      )
      .addStringOption((o) =>
        o.setName('caption').setDescription('Instagram caption').setRequired(true).setMaxLength(2200),
      ),
  );

export const post: Command = {
  data,
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!env.IG_USER_ID || !env.IG_ACCESS_TOKEN) {
      await interaction.reply({
        content: 'Instagram is not configured. Set `IG_USER_ID` and `IG_ACCESS_TOKEN` in `.env`.',
        ephemeral: true,
      });
      return;
    }

    sweepExpired();
    await interaction.deferReply();

    const sub = interaction.options.getSubcommand();
    const caption = interaction.options.getString('caption', true);

    let buf: Buffer;
    let filename: string;

    if (sub === 'meme') {
      const top = interaction.options.getString('top', true);
      const bottom = interaction.options.getString('bottom', true);
      const template = interaction.options.getString('template') ?? 'classic';
      buf = await renderToPng(memeSquareTemplate({ top, bottom, template }), { width: SIZE, height: SIZE });
      filename = 'meme.png';
    } else if (sub === 'card') {
      const title = interaction.options.getString('title', true);
      const body = interaction.options.getString('body', true);
      buf = await renderToPng(cardSquareTemplate({ title, body }), { width: SIZE, height: SIZE });
      filename = 'card.png';
    } else {
      await interaction.editReply('Unknown subcommand.');
      return;
    }

    const approvalId = newApprovalId();
    pending.set(approvalId, {
      ownerId: interaction.user.id,
      caption,
      createdAt: Date.now(),
    });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`ig:approve:${approvalId}`)
        .setLabel('Approve & Post')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`ig:cancel:${approvalId}`)
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary),
    );

    await interaction.editReply({
      content: `**Preview** — caption:\n>>> ${caption}`,
      files: [pngAttachment(buf, filename)],
      components: [row],
    });
  },
};

export async function handleInstagramButton(interaction: ButtonInteraction): Promise<void> {
  const [, action, approvalId] = interaction.customId.split(':');
  if (!approvalId) return;

  const entry = pending.get(approvalId);
  if (!entry) {
    await interaction.reply({ content: 'This preview has expired.', ephemeral: true });
    return;
  }

  if (interaction.user.id !== entry.ownerId) {
    await interaction.reply({ content: 'Only the original requester can act on this preview.', ephemeral: true });
    return;
  }

  if (action === 'cancel') {
    pending.delete(approvalId);
    await interaction.update({ content: '❌ Cancelled.', components: [] });
    return;
  }

  if (action !== 'approve') return;

  if (!env.IG_USER_ID || !env.IG_ACCESS_TOKEN) {
    await interaction.reply({ content: 'Instagram is not configured.', ephemeral: true });
    return;
  }

  const attachment = interaction.message.attachments.first();
  if (!attachment) {
    await interaction.reply({ content: 'No attached image found.', ephemeral: true });
    return;
  }

  pending.delete(approvalId);
  await interaction.update({
    content: `${interaction.message.content}\n\n⏳ Posting to Instagram…`,
    components: [],
  });

  try {
    const { permalink, mediaId } = await postImage(
      { userId: env.IG_USER_ID, accessToken: env.IG_ACCESS_TOKEN },
      { imageUrl: attachment.url, caption: entry.caption },
    );
    await interaction.editReply({
      content: `✅ Posted to Instagram: ${permalink ?? `media id ${mediaId}`}`,
    });
  } catch (err) {
    log.error('Instagram post failed', err);
    const message = err instanceof Error ? err.message : String(err);
    await interaction.editReply({
      content: `❌ Instagram post failed: ${message}`,
    });
  }
}
