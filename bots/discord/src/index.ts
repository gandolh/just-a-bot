import { Client, Events, GatewayIntentBits, Partials } from 'discord.js';
import { logger } from '@bots/shared';
import { env } from './env.ts';
import { initPlayer } from './player.ts';
import { commands, contextMenuCommands } from './commands/index.ts';
import { handleBlackjackButton } from './commands/blackjack.ts';
import { handleWordleMessage, hasWordleGame } from './commands/wordle.ts';
import { handleHangmanMessage, hasHangmanGame } from './commands/hangman.ts';
import { handleTicTacToeButton } from './commands/tictactoe.ts';
import { handleQuoteListButton } from './commands/quote.ts';
import { tickReminders, tickBirthdays } from './reminders/tick.ts';
import { handleTriviaButton } from './commands/trivia.ts';
import { handleRpgButton } from './commands/rpg-buttons.ts';
import { handleMafiaButton } from './commands/mafia.ts';
import { handleConnectFourButton } from './commands/connect-four.ts';

const log = logger.scoped('discord');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel],
});

client.once(Events.ClientReady, (c) => {
  log.info(`Logged in as ${c.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isButton() || interaction.isStringSelectMenu()) {
    if (interaction.customId.startsWith('rpg:')) {
      try {
        await handleRpgButton(interaction);
      } catch (err) {
        log.error('RPG button failed', err);
      }
      return;
    }
  }

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
    } else if (interaction.customId.startsWith('trv:')) {
      try {
        await handleTriviaButton(interaction);
      } catch (err) {
        log.error('Trivia button failed', err);
      }
    } else if (interaction.customId.startsWith('maf:')) {
      try {
        await handleMafiaButton(interaction);
      } catch (err) {
        log.error('Mafia button failed', err);
      }
    } else if (interaction.customId.startsWith('c4:')) {
      try {
        await handleConnectFourButton(interaction);
      } catch (err) {
        log.error('Connect Four button failed', err);
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

  if (message.channel.isThread()) {
    if (hasWordleGame(message.channelId)) {
      try {
        await handleWordleMessage(message);
      } catch (err) {
        log.error('Wordle message handler failed', err);
      }
      return;
    }
    if (hasHangmanGame(message.channelId)) {
      try {
        await handleHangmanMessage(message);
      } catch (err) {
        log.error('Hangman message handler failed', err);
      }
      return;
    }
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
