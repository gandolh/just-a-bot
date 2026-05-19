import { Client, Events, GatewayIntentBits } from 'discord.js';
import { logger } from '@bots/shared';
import { env } from './env.js';

const log = logger.scoped('discord');

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
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

await client.login(env.DISCORD_TOKEN);
