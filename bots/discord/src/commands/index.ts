import type { Command } from './types.ts';
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
import { img } from './img.ts';

const all: Command[] = [
  ping, play, skip, pause, resume, stop, queue, nowplaying,
  coins, slots, blackjack, dice, wordle, tictactoe,
  rpg, dnd,
  img,
  help,
];

export const commands = new Map<string, Command>(all.map((c) => [c.data.name, c]));
