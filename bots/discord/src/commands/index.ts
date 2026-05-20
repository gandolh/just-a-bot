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
import { help } from './help.ts';
import { roll } from './roll.ts';
import { spell, monster, item, condition } from './srd.ts';
import { char } from './char.ts';
import { dm } from './dm.ts';
import { init, endTurn } from './init.ts';
import { move, look, attack, use } from './play-actions.ts';
import { join, leave } from './join.ts';

const all: Command[] = [
  ping, play, skip, pause, resume, stop, queue, nowplaying,
  coins, slots, blackjack, dice,
  roll, spell, monster, item, condition, char, dm, init, endTurn,
  move, look, attack, use, join, leave,
  help,
];

export const commands = new Map<string, Command>(all.map((c) => [c.data.name, c]));
