import type { Command } from './types.js';
import { ping } from './ping.js';
import { play } from './play.js';
import { skip } from './skip.js';
import { pause } from './pause.js';
import { resume } from './resume.js';
import { stop } from './stop.js';
import { queue } from './queue.js';
import { nowplaying } from './nowplaying.js';

const all: Command[] = [ping, play, skip, pause, resume, stop, queue, nowplaying];

export const commands = new Map<string, Command>(all.map((c) => [c.data.name, c]));
