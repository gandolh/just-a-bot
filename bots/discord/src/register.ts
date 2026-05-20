import { REST, Routes } from 'discord.js';
import { logger } from '@bots/shared';
import { env } from './env.ts';
import { commands } from './commands/index.ts';

const log = logger.scoped('discord:register');

const body = Array.from(commands.values()).map((c) => c.data.toJSON());

const rest = new REST({ version: '10' }).setToken(env.DISCORD_TOKEN);

await rest.put(Routes.applicationGuildCommands(env.CLIENT_ID, env.GUILD_ID), { body });

log.info(`Registered ${body.length} guild command(s): ${body.map((c) => c.name).join(', ')}`);
