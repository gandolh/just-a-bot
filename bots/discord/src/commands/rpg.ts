import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
} from 'discord.js';
import type { Command } from './types.ts';
import {
  Character,
  World,
  getOrCreateWorld,
  updateWorld,
} from '../rpg/world.ts';
import { rollBounty } from '../rpg/bounty.ts';
import { STARTING_LOCATION } from '../rpg/locations.ts';
import {
  buildLocationView,
} from '../rpg/locationui.ts';

const PC_GLYPHS = ['🧙', '🧝', '🧛', '🧟', '🧞', '🧜', '🦸', '🥷', '👤', '🧚'];

function pickGlyph(world: World): string {
  const taken = new Set(Object.values(world.chars).map((c) => c.glyph));
  for (const g of PC_GLYPHS) if (!taken.has(g)) return g;
  return PC_GLYPHS[Math.floor(Math.random() * PC_GLYPHS.length)];
}

// Build a fresh level-1 character at an open cell near spawn.
export function makeCharacter(
  world: World,
  userId: string,
  name: string,
  glyph: string | null,
): Character {
  const fresh: Character = {
    userId,
    name,
    glyph: glyph ?? pickGlyph(world),
    locationId: STARTING_LOCATION,
    encounter: null,
    hp: 20,
    maxHp: 20,
    atk: 3,
    def: 1,
    level: 1,
    xp: 0,
    coins: 10,
    kills: 0,
    deaths: 0,
    inventory: [],
    equipment: { weapon: null, armor: null },
    bounty: null,
    lastAttackAt: 0,
    lastMoveAt: 0,
    away: false,
    downUntil: 0,
  };
  rollBounty(fresh);
  return fresh;
}

const data = new SlashCommandBuilder()
  .setName('rpg')
  .setDescription('Drop-in multiplayer RPG: explore, fight, loot, level up')
  .addSubcommand((s) =>
    s.setName('start').setDescription('Enter the world — creates your character the first time'),
  )
  .addSubcommand((s) =>
    s.setName('exit').setDescription('Step away — close the controller; you stay safe in the world'),
  )
  .addSubcommand((s) => s.setName('help').setDescription('How to play'));

export const rpg: Command = {
  data,
  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inGuild()) {
      await interaction.reply({ content: 'Use this in a server.', ephemeral: true });
      return;
    }
    const sub = interaction.options.getSubcommand();
    const userId = interaction.user.id;

    switch (sub) {
      case 'start': return handleStart(interaction, userId);
      case 'exit': return handleExit(interaction, userId);
      case 'help': return handleHelp(interaction);
    }
  },
};

async function handleStart(
  interaction: ChatInputCommandInteraction,
  userId: string,
): Promise<void> {
  // Check whether this player has a character yet. The world clock is driven by
  // the engine once a session opens, so we don't tick here.
  let hasChar = false;
  const world = await updateWorld(interaction.guildId!, (w) => {
    // Announce notable events in whichever channel people are actively playing.
    if (interaction.channelId) w.crierChannelId = interaction.channelId;
    const char = w.chars[userId];
    if (char) {
      hasChar = true;
      // Re-entering the world: clear the away flag so mobs can see them again.
      char.away = false;
    }
  });

  if (!hasChar) {
    // First time: prompt character creation. The modal collects name + glyph
    // and the modal handler creates the character and opens the controller.
    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle('🗺️ Welcome, adventurer')
      .setDescription(
        [
          'You have no character in this world yet.',
          '',
          'Press **Create character** to choose a name (and an optional emoji), then you will spawn at the plaza and the controller opens automatically.',
        ].join('\n'),
      );
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('rpg:create:open')
        .setLabel('Create character')
        .setStyle(ButtonStyle.Success)
        .setEmoji('🧙'),
    );
    await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    return;
  }

  // Returning player: open the location screen straight away.
  const char = world.chars[userId];
  const view = buildLocationView(world, char, char.encounter ? 'combat' : 'location');
  await interaction.reply({ ...view, ephemeral: true });
}

async function handleExit(
  interaction: ChatInputCommandInteraction,
  userId: string,
): Promise<void> {
  let hadChar = false;
  await updateWorld(interaction.guildId!, (w) => {
    const char = w.chars[userId];
    if (!char) return;
    hadChar = true;
    char.away = true;
  }, { urgent: true });

  if (!hadChar) {
    await interaction.reply({ content: 'You have no character. Use `/rpg start` to begin.', ephemeral: true });
    return;
  }
  await interaction.reply({
    content: '🚪 You step away from the world. You are safe — mobs cannot reach you. Use `/rpg start` to return.',
    ephemeral: true,
  });
}

async function handleHelp(interaction: ChatInputCommandInteraction): Promise<void> {
  const embed = new EmbedBuilder()
    .setColor(0x16a085)
    .setTitle('🗺️ /rpg — how to play')
    .setDescription(
      [
        '**`/rpg start`** — enter the world. The first time you create a character; after that it drops you straight back where you left off.',
        'You are always **at a place** — the Plaza and the wilds beyond it. A place shows what you can do and where you can go:',
        '• **🔍 Explore** — search the area: you might run into a foe (→ a fight), find loot or coins, or just flavour.',
        '• **🏕️ Rest** — recover some HP.',
        '• **Travel buttons** — move to a connected place. The further from the Plaza, the more dangerous — and travel itself can be ambushed.',
        '• **🎒 Bag** — equip/use items. **📋 Me** — sheet & bounty. **🏪 Town** (at the Plaza) — buy/sell.',
        '• **👥 Nearby** — appears when another adventurer is in the same place; open it to **⚔ Duel** or **🤝 Trade**.',
        '• **🚪 Exit** — step away; your character stays safe in the world until you `/rpg start` again.',
        '',
        '**Combat** — turn-based: **⚔ Attack**, **🏃 Flee**, or **🧪 Potion**. Math is `d20 + ATK vs 10 + DEF`; nat 1 misses, nat 20 crits.',
        '**Death** — you wake at the Plaza, lighter of coin. Equipment is never lost.',
      ].join('\n'),
    );
  await interaction.reply({ embeds: [embed], ephemeral: true });
}
