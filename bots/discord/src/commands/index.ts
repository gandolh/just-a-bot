import type { Command, ContextMenuCommand } from './types.ts';
import { ping } from './ping.ts';
import { play } from './play.ts';
import { skip } from './skip.ts';
import { pause } from './pause.ts';
import { resume } from './resume.ts';
import { stop } from './stop.ts';
import { queue } from './queue.ts';
import { nowplaying } from './nowplaying.ts';
import { coins } from './coins.ts';
import { slots } from './slots.ts';
import { blackjack } from './blackjack.ts';
import { dice } from './dice.ts';
import { wordle } from './wordle.ts';
import { tictactoe } from './tictactoe.ts';
import { help } from './help.ts';
import { rpg } from './rpg.ts';
import { dnd } from './dnd.ts';
import { top } from './top.ts';
import { quote, saveQuoteMenu } from './quote.ts';
import { remindme } from './remindme.ts';
import { birthday } from './birthday.ts';
import { hangman } from './hangman.ts';
import { trivia } from './trivia.ts';
import { img } from './img.ts';

const all: Command[] = [
  ping, play, skip, pause, resume, stop, queue, nowplaying,
  coins, slots, blackjack, dice, wordle, tictactoe,
  rpg, dnd,
  top,
  quote,
  remindme, birthday,
  hangman,
  trivia,
  img,
  help,
];

const allContextMenus: ContextMenuCommand[] = [saveQuoteMenu];

export const commands = new Map<string, Command>(all.map((c) => [c.data.name, c]));
export const contextMenuCommands = new Map<string, ContextMenuCommand>(
  allContextMenus.map((c) => [c.data.name, c]),
);
