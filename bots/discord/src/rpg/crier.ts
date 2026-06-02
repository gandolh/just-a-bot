import type { Client } from 'discord.js';
import { logger } from '@bots/shared';
import { drainCrierQueues } from './world.ts';

const log = logger.scoped('rpg-crier');

// The town crier: periodically announce notable world events (level-ups, boss
// kills, rare finds, deaths) to each guild's configured RPG channel. This turns
// solo actions in the shared world into shared, ambient story.
export async function tickCrier(client: Client): Promise<void> {
  const batches = await drainCrierQueues();
  for (const batch of batches) {
    try {
      const ch = await client.channels.fetch(batch.channelId);
      if (ch && ch.isTextBased() && 'send' in ch) {
        // Keep messages short — at most a handful of lines per cycle.
        const lines = batch.lines.slice(-8);
        await (ch as { send(msg: string): Promise<unknown> }).send(
          `📜 **Town crier**\n${lines.join('\n')}`,
        );
      }
    } catch (err) {
      log.error(`Failed to post crier for guild ${batch.guildId}`, err);
    }
  }
}
