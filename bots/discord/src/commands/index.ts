import type { Command, ContextMenuCommand } from './types.ts';
import { ping } from './ping.ts';
import { coins } from './coins.ts';
import { give } from './give.ts';
import { slots } from './slots.ts';
import { blackjack } from './blackjack.ts';
import { blackjack2 } from './blackjack2.ts';
import { dice } from './dice.ts';
import { dice2 } from './dice2.ts';
import { wordle } from './wordle.ts';
import { tictactoe } from './tictactoe.ts';
import { help, setHelpCatalog } from './help.ts';
import { rpg } from './rpg.ts';
import { top } from './top.ts';
import { quote, saveQuoteMenu } from './quote.ts';
import { remindme } from './remindme.ts';
import { birthday } from './birthday.ts';
import { hangman } from './hangman.ts';
import { trivia } from './trivia.ts';
import { img } from './img.ts';
import { mafia } from './mafia.ts';
import { confess } from './confess.ts';
import { clock } from './clock.ts';
import { connectFour, connectFour2 } from './connect-four.ts';
import { ask } from './ask.ts';

const all: Command[] = [
  ping,
  coins, give, slots, blackjack, blackjack2, dice, dice2, wordle, tictactoe, connectFour, connectFour2,
  rpg, mafia, confess,
  clock,
  top,
  quote,
  remindme, birthday,
  hangman,
  trivia,
  img,
  ask,
  help,
];

const allContextMenus: ContextMenuCommand[] = [saveQuoteMenu];

// /help lists whatever is registered, so it can't advertise a removed command.
setHelpCatalog(all, allContextMenus);

export const commands = new Map<string, Command>(all.map((c) => [c.data.name, c]));
export const contextMenuCommands = new Map<string, ContextMenuCommand>(
  allContextMenus.map((c) => [c.data.name, c]),
);
