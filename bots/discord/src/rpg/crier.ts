import type { Client } from "discord.js";
import { logger } from "@bots/shared";
import { drainCrierQueues } from "./world.ts";

const log = logger.scoped("rpg-crier");

export interface CrierMessage {
  content: string;
  allowedMentions: { parse: [] };
}

/**
 * One crier post. Its lines carry character names, which members choose, so
 * nothing in it may ping: names are cleaned of mention syntax, and the post
 * parses no mentions at all on top of that.
 */
export function crierMessage(lines: readonly string[]): CrierMessage {
  return { content: `📜 **Town crier**\n${lines.join("\n")}`, allowedMentions: { parse: [] } };
}

// The town crier: periodically announce notable world events (level-ups, boss
// kills, rare finds, deaths) to each guild's configured RPG channel. This turns
// solo actions in the shared world into shared, ambient story.
export async function tickCrier(client: Client): Promise<void> {
  const batches = await drainCrierQueues();
  for (const batch of batches) {
    try {
      const ch = await client.channels.fetch(batch.channelId);
      if (ch && ch.isTextBased() && "send" in ch) {
        // Keep messages short — at most a handful of lines per cycle.
        const lines = batch.lines.slice(-8);
        await (ch as { send(msg: CrierMessage): Promise<unknown> }).send(crierMessage(lines));
      }
    } catch (err) {
      log.error(`Failed to post crier for guild ${batch.guildId}`, err);
    }
  }
}
