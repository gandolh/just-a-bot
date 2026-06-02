import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
} from 'discord.js';
import type { Command } from './types.ts';
import { getAllTimezones, removeTimezone, setTimezone } from '../clock/timezones.ts';

const ALL_TIMEZONES: string[] = Intl.supportedValuesOf('timeZone');

function formatLocalTime(tz: string): string {
  const now = new Date();
  const timeStr = new Intl.DateTimeFormat('en-US', {
    timeStyle: 'short',
    timeZone: tz,
  }).format(now);

  // Compute UTC offset string (e.g. UTC+02:00 or UTC-04:00)
  const offsetMin = -new Date(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    }).format(now)
      .replace(/(\d+)-(\d+)-(\d+),? (\d+):(\d+):(\d+)/, '$1-$2-$3T$4:$5:$6')
  ).getTimezoneOffset();

  const sign = offsetMin >= 0 ? '+' : '-';
  const absMin = Math.abs(offsetMin);
  const hh = String(Math.floor(absMin / 60)).padStart(2, '0');
  const mm = String(absMin % 60).padStart(2, '0');

  return `${timeStr} — UTC${sign}${hh}:${mm}`;
}

function getUtcOffsetMinutes(tz: string): number {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60_000;
  const localStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).format(now);
  const localMs = new Date(localStr.replace(/(\d+)-(\d+)-(\d+),? (\d+):(\d+):(\d+)/, '$1-$2-$3T$4:$5:$6')).getTime();
  return Math.round((localMs - utcMs) / 60_000);
}

const data = new SlashCommandBuilder()
  .setName('clock')
  .setDescription('World clock — see what time it is for everyone')
  .addSubcommand((sub) =>
    sub
      .setName('set')
      .setDescription('Register your timezone')
      .addStringOption((o) =>
        o
          .setName('timezone')
          .setDescription('IANA timezone name, e.g. America/New_York')
          .setRequired(true)
          .setAutocomplete(true),
      ),
  )
  .addSubcommand((sub) =>
    sub.setName('unset').setDescription('Remove your registered timezone'),
  )
  .addSubcommand((sub) =>
    sub.setName('show').setDescription('Show current local time for all registered members in this server'),
  );

export const clock: Command = {
  data,

  async execute(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'set') {
      const tz = interaction.options.getString('timezone', true);
      if (!ALL_TIMEZONES.includes(tz)) {
        await interaction.reply({
          content: `Unknown timezone **${tz}**. Use a valid IANA name like \`America/New_York\` or \`Europe/Bucharest\`.`,
          ephemeral: true,
        });
        return;
      }
      await setTimezone(interaction.user.id, tz);
      await interaction.reply({
        content: `Your timezone has been set to **${tz}**. Current time: ${formatLocalTime(tz)}`,
        ephemeral: true,
      });
      return;
    }

    if (sub === 'unset') {
      await removeTimezone(interaction.user.id);
      await interaction.reply({ content: 'Your timezone has been removed.', ephemeral: true });
      return;
    }

    // sub === 'show'
    if (!interaction.inGuild()) {
      await interaction.reply({ content: 'Use this in a server.', ephemeral: true });
      return;
    }

    const all = await getAllTimezones();
    const guild = await interaction.client.guilds.fetch(interaction.guildId).catch(() => null);
    const registeredIds = Object.keys(all);

    if (registeredIds.length === 0) {
      await interaction.reply({
        content: 'No one in this server has set a timezone. Try `/clock set timezone:Continent/City`.',
        ephemeral: true,
      });
      return;
    }

    const members = await guild?.members.fetch({ user: registeredIds }).catch(() => null) ?? null;

    const guildEntries = registeredIds
      .filter((id) => members?.has(id))
      .map((id) => ({ userId: id, tz: all[id] }));

    if (guildEntries.length === 0) {
      // People have registered, but none could be resolved as members of this
      // guild — either they aren't in this server or the member fetch failed.
      // Fall back to showing everyone registered rather than claiming nobody is.
      const fallbackEntries = registeredIds.map((id) => ({ userId: id, tz: all[id] }));
      fallbackEntries.sort((a, b) => getUtcOffsetMinutes(a.tz) - getUtcOffsetMinutes(b.tz));

      const fallbackLines = fallbackEntries.map((e) => {
        const displayName = members?.get(e.userId)?.displayName ?? `<@${e.userId}>`;
        return `**${displayName}** (${e.tz})\n${formatLocalTime(e.tz)}`;
      });

      const fallbackEmbed = new EmbedBuilder()
        .setColor(0x3498db)
        .setTitle('🕐 World Clock')
        .setDescription(fallbackLines.join('\n\n'))
        .setFooter({ text: new Date().toUTCString() });

      await interaction.reply({ embeds: [fallbackEmbed] });
      return;
    }

    guildEntries.sort((a, b) => getUtcOffsetMinutes(a.tz) - getUtcOffsetMinutes(b.tz));

    const lines = guildEntries.map((e) => {
      const displayName = members?.get(e.userId)?.displayName ?? 'Unknown';
      return `**${displayName}** (${e.tz})\n${formatLocalTime(e.tz)}`;
    });

    const embed = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle('🕐 World Clock')
      .setDescription(lines.join('\n\n'))
      .setFooter({ text: new Date().toUTCString() });

    await interaction.reply({ embeds: [embed] });
  },

  async autocomplete(interaction: AutocompleteInteraction) {
    const focused = interaction.options.getFocused().toLowerCase();
    const matches = ALL_TIMEZONES.filter((tz) => tz.toLowerCase().includes(focused)).slice(0, 25);
    await interaction.respond(matches.map((tz) => ({ name: tz, value: tz })));
  },
};
