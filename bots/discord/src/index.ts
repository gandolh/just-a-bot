import { Client, Events, GatewayIntentBits } from 'discord.js';
import { logger } from '@bots/shared';
import { env } from './env.ts';
import { initPlayer } from './player.ts';
import { commands, contextMenuCommands } from './commands/index.ts';
import { handleBlackjackButton } from './commands/blackjack.ts';
import { handleWordleMessage, hasWordleGame } from './commands/wordle.ts';
import { handleTicTacToeButton } from './commands/tictactoe.ts';
import { handleQuoteListButton } from './commands/quote.ts';
import { tickReminders, tickBirthdays } from './reminders/tick.ts';

const log = logger.scoped('discord');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once(Events.ClientReady, (c) => {
  log.info(`Logged in as ${c.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isButton()) {
    if (interaction.customId.startsWith('bj:')) {
      try {
        await handleBlackjackButton(interaction);
      } catch (err) {
        log.error('Blackjack button failed', err);
      }
    } else if (interaction.customId.startsWith('ttt:')) {
      try {
        await handleTicTacToeButton(interaction);
      } catch (err) {
        log.error('Tic-tac-toe button failed', err);
      }
    } else if (interaction.customId.startsWith('quote:list:')) {
      try {
        await handleQuoteListButton(interaction);
      } catch (err) {
        log.error('Quote list button failed', err);
      }
    }
    return;
  }

  if (interaction.isMessageContextMenuCommand()) {
    const cmd = contextMenuCommands.get(interaction.commandName);
    if (!cmd) return;
    try {
      await cmd.execute(interaction);
    } catch (err) {
      log.error(`Context menu command ${interaction.commandName} failed`, err);
      const message = 'Something went wrong running that command.';
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content: message, ephemeral: true }).catch(() => {});
      } else {
        await interaction.reply({ content: message, ephemeral: true }).catch(() => {});
      }
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  const command = commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (err) {
    log.error(`Command ${interaction.commandName} failed`, err);
    const message = 'Something went wrong running that command.';
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: message, ephemeral: true }).catch(() => {});
    } else {
      await interaction.reply({ content: message, ephemeral: true }).catch(() => {});
    }
  }
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  if (message.channel.isThread() && hasWordleGame(message.channelId)) {
    try {
      await handleWordleMessage(message);
    } catch (err) {
      log.error('Wordle message handler failed', err);
    }
    return;
  }

  if (!client.user || !message.mentions.has(client.user)) return;

  const mentionPattern = new RegExp(`<@!?${client.user.id}>`, 'g');
  const stripped = message.content.replace(mentionPattern, '').trim();
  if (!stripped) return;

  await message.reply(`Echo: ${stripped}`);
});

await initPlayer(client);
await client.login(env.DISCORD_TOKEN);

setInterval(() => {
  tickReminders(client).catch((err) => log.error('tickReminders failed', err));
  tickBirthdays(client).catch((err) => log.error('tickBirthdays failed', err));
}, 60_000);
