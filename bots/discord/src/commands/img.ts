import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import type { Command } from './types.ts';
import { renderToPng } from '../img/render.ts';
import { pngAttachment } from '../img/attach.ts';
import { memeTemplate } from '../img/templates/meme.ts';
import { cardTemplate } from '../img/templates/card.ts';

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

export const img: Command = {
  data,
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const sub = interaction.options.getSubcommand();

    await interaction.deferReply();

    if (sub === 'meme') {
      const top = interaction.options.getString('top', true);
      const bottom = interaction.options.getString('bottom', true);
      const template = interaction.options.getString('template') ?? 'classic';
      const buf = await renderToPng(memeTemplate({ top, bottom, template }), { width: 600, height: 600 });
      await interaction.editReply({ files: [pngAttachment(buf, 'meme.png')] });
      return;
    }

    if (sub === 'card') {
      const title = interaction.options.getString('title', true);
      const body = interaction.options.getString('body', true);
      const buf = await renderToPng(cardTemplate({ title, body }), { width: 600, height: 340 });
      await interaction.editReply({ files: [pngAttachment(buf, 'card.png')] });
      return;
    }
  },
};
