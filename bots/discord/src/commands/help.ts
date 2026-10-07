import { ApplicationCommandOptionType, EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import type { APIApplicationCommandOption, APIEmbedField } from 'discord.js';
import type { Command, ContextMenuCommand } from './types.ts';

/**
 * `/help` is built from the registered commands, not written by hand. The
 * hand-kept list drifted both ways: it advertised seven commands that no longer
 * existed and left out eleven that did. `commands/index.ts` hands the
 * registry over once it is built (`setHelpCatalog`), so a new command shows up
 * here without anyone remembering to add it.
 */
let catalog: { commands: readonly Command[]; menus: readonly ContextMenuCommand[] } = {
  commands: [],
  menus: [],
};

export function setHelpCatalog(commands: readonly Command[], menus: readonly ContextMenuCommand[]): void {
  catalog = { commands, menus };
}

interface Group {
  title: string;
  emoji: string;
  /** Hand-written instead of a command list, where prose explains it better. */
  text?: string;
}

/** Display order. A registered command missing from `CATEGORY` lands in Other. */
const GROUPS: Record<string, Group> = {
  gambling: { title: 'Gambling', emoji: '🎰' },
  games: { title: 'Games', emoji: '🎮' },
  rpg: {
    title: 'RPG',
    emoji: '🐉',
    text: [
      'A shared text adventure per server. Explore places, fight, loot, level up.',
      '',
      '**`/rpg start`** — enter the world (creates your character the first time). You appear at a place with buttons for what to do and where to go.',
      '**`/rpg exit`** — step away; your character stays safe until you return.',
      '',
      '🔍 Explore to find foes and loot, travel between places (further = deadlier), 🏪 shop at the Plaza, and 👥 duel/trade anyone sharing your location.',
      'Die → you wake at the Plaza, lighter of coin. Equipment is never lost.',
    ].join('\n'),
  },
  social: { title: 'Social', emoji: '💬' },
  ai: { title: 'AI and images', emoji: '🤖' },
  leaderboards: { title: 'Leaderboards', emoji: '🏆' },
  misc: { title: 'Misc', emoji: '🛠️' },
  other: { title: 'Other', emoji: '📦' },
};

const CATEGORY: Record<string, keyof typeof GROUPS> = {
  coins: 'gambling', give: 'gambling', slots: 'gambling', blackjack: 'gambling',
  blackjack2: 'gambling', dice: 'gambling', dice2: 'gambling',
  wordle: 'games', tictactoe: 'games', c4: 'games', c42: 'games',
  mafia: 'games', hangman: 'games', trivia: 'games',
  rpg: 'rpg',
  quote: 'social', confess: 'social', birthday: 'social', remindme: 'social', clock: 'social',
  ask: 'ai', img: 'ai',
  top: 'leaderboards',
  ping: 'misc', help: 'misc',
};

/** One line per runnable form: a line per subcommand, or one for the command. */
function commandLines(command: Command): string[] {
  const json = command.data.toJSON();
  const subs = (json.options ?? []).flatMap((option: APIApplicationCommandOption): [string, string][] => {
    if (option.type === ApplicationCommandOptionType.Subcommand) {
      return [[`${json.name} ${option.name}`, option.description]];
    }
    if (option.type === ApplicationCommandOptionType.SubcommandGroup) {
      return (option.options ?? []).map((sub) => [`${json.name} ${option.name} ${sub.name}`, sub.description]);
    }
    return [];
  });
  const forms = subs.length > 0 ? subs : [[json.name, json.description] as [string, string]];
  return forms.map(([name, description]) => `\`/${name}\` — ${description}`);
}

/** Discord's embed limits, which a long group would otherwise break. */
const FIELD_VALUE_MAX = 1024;
const MAX_FIELDS = 25;

/** Pack lines into as few field values as fit under the per-field limit. */
function packLines(lines: string[]): string[] {
  const values: string[] = [];
  let current = '';
  for (const line of lines) {
    const next = current ? `${current}\n${line}` : line;
    if (next.length > FIELD_VALUE_MAX && current) {
      values.push(current);
      current = line.slice(0, FIELD_VALUE_MAX);
    } else {
      current = next.slice(0, FIELD_VALUE_MAX);
    }
  }
  if (current) values.push(current);
  return values;
}

/** The embed fields for the current catalog. Pure, so it can be checked
 * without a client. */
export function buildHelpFields(): APIEmbedField[] {
  const lines = new Map<string, string[]>(Object.keys(GROUPS).map((key) => [key, []]));
  for (const command of catalog.commands) {
    const key = CATEGORY[command.data.name] ?? 'other';
    if (GROUPS[key]?.text) continue;
    lines.get(key)!.push(...commandLines(command));
  }
  for (const menu of catalog.menus) {
    lines.get('social')!.push(`**${menu.data.name}** — right-click a message → Apps`);
  }

  const fields: APIEmbedField[] = [];
  for (const [key, group] of Object.entries(GROUPS)) {
    const name = `${group.emoji} ${group.title}`;
    if (group.text) {
      if (catalog.commands.some((c) => (CATEGORY[c.data.name] ?? 'other') === key)) {
        fields.push({ name, value: group.text });
      }
      continue;
    }
    const values = packLines(lines.get(key)!);
    values.forEach((value, i) => fields.push({ name: i === 0 ? name : `${name} (cont.)`, value }));
  }
  return fields.slice(0, MAX_FIELDS);
}

export const help: Command = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show all available commands'),
  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setTitle('just-a-bot — commands')
      .setColor(0x5865f2)
      .setDescription('Coins are hypothetical. No real payments are made.')
      .addFields(buildHelpFields());

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
