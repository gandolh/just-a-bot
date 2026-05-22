import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import type { Command } from './types.ts';
import { setBirthday, removeBirthday, listBirthdays } from '../reminders/birthdays.ts';

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function fmtDate(month: number, day: number): string {
  return `${MONTHS[month - 1]} ${day}`;
}

function parseDate(raw: string): { month: number; day: number } | null {
  const m = raw.trim().match(/^(\d{1,2})-(\d{1,2})$/);
  if (!m) return null;
  const month = parseInt(m[1], 10);
  const day = parseInt(m[2], 10);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  return { month, day };
}

const data = new SlashCommandBuilder()
  .setName('birthday')
  .setDescription('Set or view birthdays in this server')
  .addSubcommand((s) =>
    s
      .setName('set')
      .setDescription('Save your birthday (MM-DD). The bot wishes you happy birthday in this channel each year.')
      .addStringOption((o) =>
        o.setName('date').setDescription('Your birthday in MM-DD format, e.g. 06-15').setRequired(true),
      ),
  )
  .addSubcommand((s) => s.setName('list').setDescription('List all birthdays in this server'))
  .addSubcommand((s) => s.setName('remove').setDescription('Remove your birthday from this server'));

export const birthday: Command = {
  data,
  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inCachedGuild()) {
      await interaction.reply({ content: 'Use this in a server.', ephemeral: true });
      return;
    }
    const sub = interaction.options.getSubcommand();
    switch (sub) {
      case 'set': return handleSet(interaction);
      case 'list': return handleList(interaction);
      case 'remove': return handleRemove(interaction);
    }
  },
};

async function handleSet(interaction: ChatInputCommandInteraction): Promise<void> {
  const raw = interaction.options.getString('date', true);
  const parsed = parseDate(raw);
  if (!parsed) {
    await interaction.reply({
      content: 'Invalid date format. Use `MM-DD`, e.g. `06-15` for June 15.',
      ephemeral: true,
    });
    return;
  }
  await setBirthday({
    userId: interaction.user.id,
    guildId: interaction.guildId!,
    channelId: interaction.channelId,
    month: parsed.month,
    day: parsed.day,
    lastFiredYear: null,
  });
  await interaction.reply({
    content: `Birthday set to **${fmtDate(parsed.month, parsed.day)}**. I'll wish you happy birthday in this channel each year!`,
    ephemeral: true,
  });
}

async function handleList(interaction: ChatInputCommandInteraction): Promise<void> {
  const birthdays = await listBirthdays(interaction.guildId!);
  if (birthdays.length === 0) {
    await interaction.reply({ content: 'No birthdays recorded in this server yet.', ephemeral: true });
    return;
  }
  const lines = birthdays.map(
    (b) => `${fmtDate(b.month, b.day)} — <@${b.userId}>`,
  );
  await interaction.reply({ content: lines.join('\n'), ephemeral: true });
}

async function handleRemove(interaction: ChatInputCommandInteraction): Promise<void> {
  const ok = await removeBirthday(interaction.guildId!, interaction.user.id);
  await interaction.reply({
    content: ok ? 'Your birthday has been removed.' : 'You have no birthday set in this server.',
    ephemeral: true,
  });
}
