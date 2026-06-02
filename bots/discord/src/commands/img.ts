import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { logger } from '@bots/shared';
import type { Command } from './types.ts';
import { renderToPng } from '../img/render.ts';
import { editReplyWithImage } from '../img/upload.ts';
import { memeTemplate } from '../img/templates/meme.ts';
import { cardTemplate } from '../img/templates/card.ts';

const log = logger.scoped('img');

const data = new SlashCommandBuilder()
  .setName('img')
  .setDescription('Generate a PNG image')
  .addSubcommand((s) =>
    s
      .setName('meme')
      .setDescription('Classic top/bottom-text meme')
      .addStringOption((o) =>
        o.setName('top').setDescription('Top caption text').setRequired(true).setMaxLength(120),
      )
      .addStringOption((o) =>
        o.setName('bottom').setDescription('Bottom caption text').setRequired(true).setMaxLength(120),
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
      .setDescription('Generic announcement/quote card')
      .addStringOption((o) =>
        o.setName('title').setDescription('Card title').setRequired(true).setMaxLength(120),
      )
      .addStringOption((o) =>
        o.setName('body').setDescription('Card body text').setRequired(true).setMaxLength(300),
      ),
  );

/** Render a template to PNG, logging timing and output size. */
async function render(
  reqId: string,
  node: Record<string, unknown>,
  dims: { width: number; height: number },
): Promise<Buffer> {
  log.debug(`[${reqId}] rendering ${dims.width}x${dims.height}…`);
  const t0 = performance.now();
  const buf = await renderToPng(node, dims);
  log.info(`[${reqId}] rendered`, { ms: Math.round(performance.now() - t0), bytes: buf.length });
  return buf;
}

/**
 * Upload the rendered image to the deferred reply, with one retry.
 *
 * Uses a fetch-based webhook PATCH (see editReplyWithImage) instead of
 * interaction.editReply({ files }), because @discordjs/rest@2.6.1 hangs on
 * multipart uploads under Node 24.
 */
async function sendImage(
  reqId: string,
  interaction: ChatInputCommandInteraction,
  buf: Buffer,
  filename: string,
): Promise<void> {
  const attempt = (n: number) => {
    log.debug(`[${reqId}] uploading ${filename} (${buf.length} bytes), attempt ${n}…`);
    return editReplyWithImage(interaction, buf, filename);
  };

  const t0 = performance.now();
  try {
    await attempt(1);
  } catch (err) {
    log.warn(`[${reqId}] upload attempt 1 failed after ${Math.round(performance.now() - t0)}ms, retrying`, err);
    await attempt(2);
  }
  log.info(`[${reqId}] uploaded`, { ms: Math.round(performance.now() - t0) });
}

let reqCounter = 0;

export const img: Command = {
  data,
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const sub = interaction.options.getSubcommand();
    const reqId = `img#${++reqCounter}`;

    log.info(`[${reqId}] request`, { sub, user: interaction.user.tag });
    await interaction.deferReply();

    const t0 = performance.now();
    try {
      if (sub === 'meme') {
        const top = interaction.options.getString('top', true);
        const bottom = interaction.options.getString('bottom', true);
        const template = interaction.options.getString('template') ?? 'classic';
        const buf = await render(reqId, memeTemplate({ top, bottom, template }), { width: 600, height: 600 });
        await sendImage(reqId, interaction, buf, 'meme.png');
      } else if (sub === 'card') {
        const title = interaction.options.getString('title', true);
        const body = interaction.options.getString('body', true);
        const buf = await render(reqId, cardTemplate({ title, body }), { width: 600, height: 340 });
        await sendImage(reqId, interaction, buf, 'card.png');
      }
      log.info(`[${reqId}] done`, { ms: Math.round(performance.now() - t0) });
    } catch (err) {
      log.error(`[${reqId}] failed after ${Math.round(performance.now() - t0)}ms`, err);
      // Leave the user with a message instead of a perpetual "thinking…" state.
      await interaction
        .editReply('Sorry, I could not generate that image (the upload to Discord may have timed out). Please try again.')
        .catch(() => {});
    }
  },
};
