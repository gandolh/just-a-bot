import {
  ChannelType,
  ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
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
        o
          .setName('channel')
          .setDescription('Target channel')
          .setRequired(true)
          .addChannelTypes(
            ChannelType.GuildText,
            ChannelType.GuildAnnouncement,
            ChannelType.PublicThread,
            ChannelType.PrivateThread,
          ),
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
  const allowedTypes: ChannelType[] = [
    ChannelType.GuildText,
    ChannelType.GuildAnnouncement,
    ChannelType.PublicThread,
    ChannelType.PrivateThread,
  ];
  if (!allowedTypes.includes(channel.type)) {
    await interaction.reply({ content: 'Please select a text channel.', ephemeral: true });
    return;
  }

  await setChannel(interaction.guildId!, channel.id);
  await interaction.reply({
    content: `Confessions will now be posted in <#${channel.id}>.`,
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

  let fetchError: unknown;
  const targetChannel = await interaction.client.channels
    .fetch(store.channelId)
    .catch((err: unknown) => {
      fetchError = err;
      return null;
    });

  if (!targetChannel) {
    // 50001 Missing Access → the bot can't see the channel (permissions).
    // Anything else (e.g. 10003 Unknown Channel) → it's gone or renamed.
    const code = (fetchError as { code?: number } | undefined)?.code;
    const content =
      code === 50001
        ? "I can't access the confession channel. Give me **View Channel** and **Send Messages** permission there, then try again."
        : 'The configured confession channel no longer exists. Ask an admin to run `/confess set-channel` again.';
    await interaction.reply({ content, ephemeral: true });
    return;
  }

  if (!targetChannel.isTextBased() || !('send' in targetChannel)) {
    await interaction.reply({
      content: 'The configured confession channel is not a text channel. Ask an admin to run `/confess set-channel` again.',
      ephemeral: true,
    });
    return;
  }

  // Record the confession first so it gets a stable ID, but only commit the
  // cooldown after the post actually succeeds.
  const entry = await addConfession(interaction.guildId!, text);

  const embed = new EmbedBuilder()
    .setTitle(`Anonymous Confession #${entry.id}`)
    .setDescription(text)
    .setColor(0x5865f2)
    .setFooter({ text: new Date(entry.postedAt).toUTCString() });

  try {
    await targetChannel.send({ embeds: [embed] });
  } catch {
    await interaction.reply({
      content: "I couldn't post to the confession channel — check that I have **Send Messages** permission there.",
      ephemeral: true,
    });
    return;
  }

  cooldowns.set(`${interaction.guildId!}:${userId}`, Date.now());

  await interaction.reply({
    content: `Posted. ID: #${entry.id}`,
    ephemeral: true,
  });
}
