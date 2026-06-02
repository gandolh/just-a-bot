import {
  ActionRowBuilder,
  ApplicationCommandType,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  ContextMenuCommandBuilder,
  EmbedBuilder,
  MessageContextMenuCommandInteraction,
  PermissionsBitField,
  SlashCommandBuilder,
} from 'discord.js';
import type { Command, ContextMenuCommand } from './types.ts';
import {
  appendQuote,
  getQuote,
  loadBook,
  removeQuote,
} from '../quotes/store.ts';

const MESSAGE_LINK_RE =
  /https?:\/\/(?:www\.)?discord(?:app)?\.com\/channels\/(\d+)\/(\d+)\/(\d+)/;

const PAGE_SIZE = 10;

const data = new SlashCommandBuilder()
  .setName('quote')
  .setDescription('Save and recall memorable server messages')
  .addSubcommand((s) =>
    s
      .setName('add')
      .setDescription('Save a message by its Discord link')
      .addStringOption((o) =>
        o.setName('link').setDescription('Discord message link').setRequired(true),
      ),
  )
  .addSubcommand((s) => s.setName('random').setDescription('Post a random quote from this server'))
  .addSubcommand((s) =>
    s
      .setName('search')
      .setDescription('Find the most recent quote containing text')
      .addStringOption((o) =>
        o.setName('text').setDescription('Search query').setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('by')
      .setDescription('Random quote from a specific author')
      .addUserOption((o) => o.setName('user').setDescription('Author').setRequired(true)),
  )
  .addSubcommand((s) => s.setName('list').setDescription('Paginated list of all quotes'))
  .addSubcommand((s) =>
    s
      .setName('remove')
      .setDescription('Remove a quote by ID')
      .addStringOption((o) =>
        o.setName('id').setDescription('Quote ID').setRequired(true),
      ),
  );

export const quote: Command = {
  data,
  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inGuild()) {
      await interaction.reply({ content: 'Use this in a server.', ephemeral: true });
      return;
    }
    const sub = interaction.options.getSubcommand();
    switch (sub) {
      case 'add': return handleAdd(interaction);
      case 'random': return handleRandom(interaction);
      case 'search': return handleSearch(interaction);
      case 'by': return handleBy(interaction);
      case 'list': return handleList(interaction, 0);
      case 'remove': return handleRemove(interaction);
    }
  },
};

const saveQuoteData = new ContextMenuCommandBuilder()
  .setName('Save Quote')
  .setType(ApplicationCommandType.Message);

export const saveQuoteMenu: ContextMenuCommand = {
  data: saveQuoteData,
  async execute(interaction: MessageContextMenuCommandInteraction) {
    if (!interaction.inGuild()) {
      await interaction.reply({ content: 'Use this in a server.', ephemeral: true });
      return;
    }
    const msg = interaction.targetMessage;
    const q = await appendQuote(interaction.guildId, {
      authorId: msg.author.id,
      authorTag: msg.author.tag,
      content: msg.content,
      channelId: msg.channelId,
      messageId: msg.id,
      attachments: [...msg.attachments.values()].map((a) => a.url),
      savedBy: interaction.user.id,
    });
    await interaction.reply({
      content: `Quote saved! ID: \`${q.id}\``,
      ephemeral: true,
    });
  },
};

async function handleAdd(interaction: ChatInputCommandInteraction): Promise<void> {
  const link = interaction.options.getString('link', true);
  const match = MESSAGE_LINK_RE.exec(link);
  if (!match) {
    await interaction.reply({ content: 'That does not look like a valid Discord message link.', ephemeral: true });
    return;
  }
  const [, linkGuildId, channelId, messageId] = match;
  if (linkGuildId !== interaction.guildId) {
    await interaction.reply({ content: 'That message is from a different server.', ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const channel = await interaction.client.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased()) {
    await interaction.editReply('Could not find that channel.');
    return;
  }

  let msg;
  try {
    msg = await channel.messages.fetch(messageId);
  } catch {
    await interaction.editReply('Could not fetch that message. Check the link and bot permissions.');
    return;
  }

  const q = await appendQuote(interaction.guildId, {
    authorId: msg.author.id,
    authorTag: msg.author.tag,
    content: msg.content,
    channelId: msg.channelId,
    messageId: msg.id,
    attachments: [...msg.attachments.values()].map((a) => a.url),
    savedBy: interaction.user.id,
  });

  await interaction.editReply(`Quote saved! ID: \`${q.id}\``);
}

async function handleRandom(interaction: ChatInputCommandInteraction): Promise<void> {
  const book = await loadBook(interaction.guildId!);
  if (book.quotes.length === 0) {
    await interaction.reply({ content: 'No quotes saved yet. Use `/quote add` or right-click a message.', ephemeral: true });
    return;
  }
  const q = book.quotes[Math.floor(Math.random() * book.quotes.length)];
  await interaction.reply({ embeds: [buildQuoteEmbed(q)] });
}

async function handleSearch(interaction: ChatInputCommandInteraction): Promise<void> {
  const text = interaction.options.getString('text', true).toLowerCase();
  const book = await loadBook(interaction.guildId!);
  const match = [...book.quotes].reverse().find((q) => q.content.toLowerCase().includes(text));
  if (!match) {
    await interaction.reply({ content: `No quotes found containing \`${text}\`.`, ephemeral: true });
    return;
  }
  await interaction.reply({ embeds: [buildQuoteEmbed(match)] });
}

async function handleBy(interaction: ChatInputCommandInteraction): Promise<void> {
  const user = interaction.options.getUser('user', true);
  const book = await loadBook(interaction.guildId!);
  const pool = book.quotes.filter((q) => q.authorId === user.id);
  if (pool.length === 0) {
    await interaction.reply({ content: `No quotes saved from ${user.displayName}.`, ephemeral: true });
    return;
  }
  const q = pool[Math.floor(Math.random() * pool.length)];
  await interaction.reply({ embeds: [buildQuoteEmbed(q)] });
}

async function handleList(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  page: number,
): Promise<void> {
  const guildId = interaction.guildId!;
  const book = await loadBook(guildId);

  if (book.quotes.length === 0) {
    const content = 'No quotes saved yet.';
    if ('deferReply' in interaction && typeof interaction.deferReply === 'function') {
      await (interaction as ChatInputCommandInteraction).reply({ content, ephemeral: true });
    } else {
      await (interaction as ButtonInteraction).reply({ content, ephemeral: true });
    }
    return;
  }

  const totalPages = Math.ceil(book.quotes.length / PAGE_SIZE);
  const safePage = Math.max(0, Math.min(page, totalPages - 1));
  const slice = book.quotes.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`Quote Book — Page ${safePage + 1} / ${totalPages}`)
    .setDescription(
      slice
        .map((q) => `\`${q.id}\` **${q.authorTag}**: ${q.content.slice(0, 80)}${q.content.length > 80 ? '…' : ''}`)
        .join('\n'),
    );

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`quote:list:${safePage - 1}`)
      .setLabel('← Prev')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(safePage === 0),
    new ButtonBuilder()
      .setCustomId(`quote:list:${safePage + 1}`)
      .setLabel('Next →')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(safePage >= totalPages - 1),
  );

  const payload = { embeds: [embed], components: [row] };

  if ((interaction as ButtonInteraction).isButton?.()) {
    await (interaction as ButtonInteraction).update(payload);
  } else {
    await (interaction as ChatInputCommandInteraction).reply(payload);
  }
}

async function handleRemove(interaction: ChatInputCommandInteraction): Promise<void> {
  const id = interaction.options.getString('id', true);
  const q = await getQuote(interaction.guildId!, id);
  if (!q) {
    await interaction.reply({ content: `No quote with ID \`${id}\` found.`, ephemeral: true });
    return;
  }

  const canRemove =
    interaction.user.id === q.savedBy ||
    interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageMessages);

  if (!canRemove) {
    await interaction.reply({ content: 'Only the person who saved this quote or a moderator can remove it.', ephemeral: true });
    return;
  }

  await removeQuote(interaction.guildId!, id);
  await interaction.reply({ content: `Quote \`${id}\` removed.`, ephemeral: true });
}

export async function handleQuoteListButton(interaction: ButtonInteraction): Promise<void> {
  const parts = interaction.customId.split(':');
  const page = parseInt(parts[2], 10);
  await handleList(interaction, page);
}

function buildQuoteEmbed(q: { content: string; authorTag: string; savedBy: string; savedAt: string; attachments: string[]; id: string }): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setDescription(q.content || '*(no text)*')
    .setFooter({ text: `— ${q.authorTag} · saved by <@${q.savedBy}> · ID: ${q.id}` })
    .setTimestamp(new Date(q.savedAt));

  const imageUrl = q.attachments.find((a) => /\.(png|jpe?g|gif|webp)(\?.*)?$/i.test(a));
  if (imageUrl) embed.setImage(imageUrl);

  return embed;
}
