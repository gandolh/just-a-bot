import { Client, Events, GatewayIntentBits } from 'discord.js';
import { logger } from '@bots/shared';
import { env } from './env.js';

const log = logger.scoped('discord');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once(Events.ClientReady, (c) => {
  log.info(`Logged in as ${c.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'ping') {
    await interaction.reply('Pong!');
  }
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;
  if (!client.user || !message.mentions.has(client.user)) return;

  const mentionPattern = new RegExp(`<@!?${client.user.id}>`, 'g');
  const stripped = message.content.replace(mentionPattern, '').trim();
  if (!stripped) return;

  await message.reply(`Echo: ${stripped}`);
});

await client.login(env.DISCORD_TOKEN);
