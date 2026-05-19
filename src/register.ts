import { REST, Routes, SlashCommandBuilder } from 'discord.js';
import { env } from './env.js';

const commands = [
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Replies with Pong!')
    .toJSON(),
];

const rest = new REST({ version: '10' }).setToken(env.DISCORD_TOKEN);

await rest.put(
  Routes.applicationGuildCommands(env.CLIENT_ID, env.GUILD_ID),
  { body: commands },
);

console.log(`Registered ${commands.length} guild command(s).`);
