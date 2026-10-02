import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import type { Command } from './types.ts';
import { addReminder, listReminders, cancelReminder } from '../reminders/store.ts';
import { parseWhen } from '../reminders/parse.ts';

const data = new SlashCommandBuilder()
  .setName('remindme')
  .setDescription('Set or manage personal reminders')
  .addSubcommand((s) =>
    s
      .setName('set')
      .setDescription('Schedule a reminder')
      .addStringOption((o) =>
        o.setName('when').setDescription('e.g. 30m, 2h, 3d, tomorrow 9am, 2026-06-01 15:00').setRequired(true),
      )
      .addStringOption((o) =>
        // 1000 keeps the delivered "<@id> reminder: …" well under Discord's
        // 2000-character message limit.
        o.setName('text').setDescription('What to remind you about').setRequired(true).setMaxLength(1000),
      ),
  )
  .addSubcommand((s) => s.setName('list').setDescription('List your pending reminders'))
  .addSubcommand((s) =>
    s
      .setName('cancel')
      .setDescription('Cancel a pending reminder by ID')
      .addStringOption((o) => o.setName('id').setDescription('Reminder ID').setRequired(true)),
  );

export const remindme: Command = {
  data,
  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inGuild()) {
      await interaction.reply({ content: 'Use this in a server.', ephemeral: true });
      return;
    }
    const sub = interaction.options.getSubcommand();
    switch (sub) {
      case 'set': return handleSet(interaction);
      case 'list': return handleList(interaction);
      case 'cancel': return handleCancel(interaction);
    }
  },
};

async function handleSet(interaction: ChatInputCommandInteraction): Promise<void> {
  const whenRaw = interaction.options.getString('when', true);
  const text = interaction.options.getString('text', true);
  const dueAt = parseWhen(whenRaw);
  if (!dueAt) {
    await interaction.reply({
      content: 'Could not parse that time. Try `30m`, `2h`, `3d`, `tomorrow 9am`, or `2026-06-01 15:00`.',
      ephemeral: true,
    });
    return;
  }
  if (dueAt <= new Date()) {
    await interaction.reply({ content: 'That time is in the past.', ephemeral: true });
    return;
  }
  const id = crypto.randomUUID().slice(0, 8);
  await addReminder({
    id,
    userId: interaction.user.id,
    guildId: interaction.guildId!,
    channelId: interaction.channelId,
    dueAt: dueAt.toISOString(),
    text,
    createdAt: new Date().toISOString(),
  });
  await interaction.reply({
    content: `Reminder set! ID: \`${id}\` — I'll ping you <t:${Math.floor(dueAt.getTime() / 1000)}:R>.`,
    ephemeral: true,
  });
}

async function handleList(interaction: ChatInputCommandInteraction): Promise<void> {
  const reminders = await listReminders(interaction.user.id, interaction.guildId!);
  if (reminders.length === 0) {
    await interaction.reply({ content: 'You have no pending reminders.', ephemeral: true });
    return;
  }
  // Discord rejects a message over 2000 characters, and a failed list hides the
  // IDs a user needs to cancel anything. So each text is clipped and the list
  // stops before the limit, saying how many it left out.
  const lines: string[] = [];
  let length = 0;
  for (const r of reminders) {
    const text = r.text.length > LIST_TEXT_MAX ? `${r.text.slice(0, LIST_TEXT_MAX - 1)}…` : r.text;
    const line = `\`${r.id}\` — <t:${Math.floor(new Date(r.dueAt).getTime() / 1000)}:R> — ${text}`;
    if (length + line.length + 1 > LIST_BUDGET) break;
    lines.push(line);
    length += line.length + 1;
  }
  const hidden = reminders.length - lines.length;
  if (hidden > 0) lines.push(`…and ${hidden} more`);
  await interaction.reply({ content: lines.join('\n'), ephemeral: true });
}

/** Characters of each reminder's text shown in `/remindme list`. */
const LIST_TEXT_MAX = 80;
/** Room for the list lines, leaving margin under Discord's 2000 for "…and N more". */
const LIST_BUDGET = 1900;

async function handleCancel(interaction: ChatInputCommandInteraction): Promise<void> {
  const id = interaction.options.getString('id', true);
  const ok = await cancelReminder(id, interaction.user.id);
  await interaction.reply({
    content: ok ? `Reminder \`${id}\` cancelled.` : `No reminder with ID \`${id}\` found.`,
    ephemeral: true,
  });
}
