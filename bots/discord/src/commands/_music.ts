import type { ChatInputCommandInteraction } from 'discord.js';
import { useQueue, type GuildQueue } from 'discord-player';

/**
 * Shared guard for the music control commands. Returns the active guild queue,
 * or replies + returns `null` when there's nothing to act on. Caller should
 * `return` on null.
 *
 * - Not in a cached guild → silent `null` (matches the commands' prior behavior).
 * - `requireTrack` (default true) → also requires something currently playing.
 */
export async function getActiveQueue(
  interaction: ChatInputCommandInteraction,
  { requireTrack = true, emptyMessage = 'Nothing is playing.' }: {
    requireTrack?: boolean;
    emptyMessage?: string;
  } = {},
): Promise<GuildQueue | null> {
  if (!interaction.inCachedGuild()) return null;
  const queue = useQueue(interaction.guildId);
  if (!queue || (requireTrack && !queue.currentTrack)) {
    await interaction.reply({ content: emptyMessage, ephemeral: true });
    return null;
  }
  return queue;
}
