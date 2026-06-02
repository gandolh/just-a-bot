import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  TextChannel,
} from 'discord.js';
import type { Command } from './types.ts';
import { loadStore, setChannel, addConfession } from '../confessions/store.ts';

const MAX_LENGTH = 1000;
const COOLDOWN_MS = 60_000;

const cooldowns = new Map<string, number>();

const data = new SlashCommandBuilder()
  .setName('confess')
  .setDescription('Anonymous confession box')
  .addSubcommand((s) =>
    s
      .setName('set-channel')
      .setDescription('Set the channel where confessions are posted (admin only)')
      .addChannelOption((o) =>
        o.setName('channel').setDescription('Target channel').setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('submit')
      .setDescription('Submit an anonymous confession')
      .addStringOption((o) =>
        o
          .setName('text')
          .setDescription('Your confession (max 1000 chars)')
          .setRequired(true)
          .setMaxLength(MAX_LENGTH),
      ),
  );

export const confess: Command = {
  data,
  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inGuild()) {
      await interaction.reply({ content: 'Use this in a server.', ephemeral: true });
      return;
    }
    const sub = interaction.options.getSubcommand();
    if (sub === 'set-channel') return handleSetChannel(interaction);
    if (sub === 'submit') return handleSubmit(interaction);
  },
};

async function handleSetChannel(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({
      content: 'You need the **Manage Server** permission to configure the confession channel.',
      ephemeral: true,
    });
    return;
  }

  const channel = interaction.options.getChannel('channel', true);
  if (!(channel instanceof TextChannel)) {
    await interaction.reply({ content: 'Please select a text channel.', ephemeral: true });
    return;
  }

  await setChannel(interaction.guildId!, channel.id);
  await interaction.reply({
    content: `Confessions will now be posted in ${channel}.`,
    ephemeral: true,
  });
}

async function handleSubmit(interaction: ChatInputCommandInteraction): Promise<void> {
  const userId = interaction.user.id;

  const lastAt = cooldowns.get(`${interaction.guildId!}:${userId}`) ?? 0;
  const remaining = Math.ceil((lastAt + COOLDOWN_MS - Date.now()) / 1000);
  if (remaining > 0) {
    await interaction.reply({
      content: `You're submitting too fast. Please wait ${remaining}s before your next confession.`,
      ephemeral: true,
    });
    return;
  }

  const store = await loadStore(interaction.guildId!);
  if (!store.channelId) {
    await interaction.reply({
      content: 'An admin needs to run `/confess set-channel` first.',
      ephemeral: true,
    });
    return;
  }

  const text = interaction.options.getString('text', true);
  if (text.length > MAX_LENGTH) {
    await interaction.reply({
      content: `Your confession is too long (${text.length} / ${MAX_LENGTH} chars).`,
      ephemeral: true,
    });
    return;
  }

  const targetChannel = await interaction.client.channels.fetch(store.channelId).catch(() => null);
  if (!targetChannel || !(targetChannel instanceof TextChannel)) {
    await interaction.reply({
      content: 'The configured confession channel no longer exists. Ask an admin to run `/confess set-channel` again.',
      ephemeral: true,
    });
    return;
  }

  const entry = await addConfession(interaction.guildId!, text);

  cooldowns.set(`${interaction.guildId!}:${userId}`, Date.now());

  const embed = new EmbedBuilder()
    .setTitle(`Anonymous Confession #${entry.id}`)
    .setDescription(text)
    .setColor(0x5865f2)
    .setFooter({ text: new Date(entry.postedAt).toUTCString() });

  await targetChannel.send({ embeds: [embed] });

  await interaction.reply({
    content: `Posted. ID: #${entry.id}`,
    ephemeral: true,
  });
}
