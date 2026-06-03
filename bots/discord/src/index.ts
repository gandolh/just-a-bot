import { Client, Events, GatewayIntentBits, Partials } from 'discord.js';
import { logger } from '@bots/shared';
import { env } from './env.ts';
import { initPlayer } from './player.ts';
import { commands, contextMenuCommands } from './commands/index.ts';
import { handleBlackjackButton } from './commands/blackjack.ts';
import { handleBlackjack2Button } from './commands/blackjack2.ts';
import { handleDice2Button } from './commands/dice2.ts';
import { handleWordleMessage, hasWordleGame } from './commands/wordle.ts';
import { handleHangmanMessage, hasHangmanGame } from './commands/hangman.ts';
import { handleTicTacToeButton } from './commands/tictactoe.ts';
import { handleQuoteListButton } from './commands/quote.ts';
import { tickReminders, tickBirthdays } from './reminders/tick.ts';
import { tickCrier } from './rpg/crier.ts';
import { handleTriviaButton } from './commands/trivia.ts';
import { handleRpgButton } from './commands/rpg-buttons.ts';
import { handleMafiaButton } from './commands/mafia.ts';
import { handleConnectFourButton } from './commands/connect-four.ts';
import { handleInstagramButton } from './commands/post.ts';
import { startLink as startDiceTableLink } from './dicetable/link.ts';

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
  if (
    interaction.isButton() ||
    interaction.isStringSelectMenu() ||
    interaction.isModalSubmit()
  ) {
    if (interaction.customId.startsWith('rpg:')) {
      try {
        await handleRpgButton(interaction);
      } catch (err) {
        log.error('RPG interaction failed', err);
      }
      return;
    }
  }

  if (interaction.isButton()) {
    if (interaction.customId.startsWith('bj2:')) {
      try {
        await handleBlackjack2Button(interaction);
      } catch (err) {
        log.error('Blackjack 2P button failed', err);
      }
    } else if (interaction.customId.startsWith('bj:')) {
      try {
        await handleBlackjackButton(interaction);
      } catch (err) {
        log.error('Blackjack button failed', err);
      }
    } else if (interaction.customId.startsWith('dice2:')) {
      try {
        await handleDice2Button(interaction);
      } catch (err) {
        log.error('Dice 2P button failed', err);
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
    } else if (interaction.customId.startsWith('ig:')) {
      try {
        await handleInstagramButton(interaction);
      } catch (err) {
        log.error('Instagram button failed', err);
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

  if (interaction.isAutocomplete()) {
    const command = commands.get(interaction.commandName);
    if (command?.autocomplete) {
      try {
        await command.autocomplete(interaction);
      } catch (err) {
        log.error(`Autocomplete ${interaction.commandName} failed`, err);
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

if (env.DICE_ACTIVITY_WS_URL && env.DICE_ACTIVITY_TOKEN) {
  startDiceTableLink({ url: env.DICE_ACTIVITY_WS_URL, token: env.DICE_ACTIVITY_TOKEN });
}

setInterval(() => {
  tickReminders(client).catch((err) => log.error('tickReminders failed', err));
  tickBirthdays(client).catch((err) => log.error('tickBirthdays failed', err));
}, 60_000);

// The RPG town crier drains pending world events more frequently so notable
// moments are announced while they're still fresh.
setInterval(() => {
  tickCrier(client).catch((err) => log.error('tickCrier failed', err));
}, 20_000);
