import type { Client, TextChannel, ThreadChannel } from 'discord.js';
import { EmbedBuilder } from 'discord.js';
import type { MafiaGame, Player } from './store.ts';
import { updateGame } from './store.ts';
import { aliveByRole, alivePlayers } from './roles.ts';
import {
  nightKillButtons,
  nightSaveButtons,
  roleDmEmbed,
} from './render.ts';

export async function sendRoleDms(
  client: Client,
  game: MafiaGame,
): Promise<string[]> {
  const failed: string[] = [];
  for (const player of Object.values(game.players)) {
    try {
      const user = await client.users.fetch(player.userId);
      const embed = roleDmEmbed(player.role!, game.guildId);
      if (player.role === 'mafia') {
        const allMafia = Object.values(game.players)
          .filter((p) => p.role === 'mafia' && p.userId !== player.userId)
          .map((p) => `<@${p.userId}> (${p.tag})`)
          .join(', ');
        if (allMafia) {
          embed.addFields({ name: 'Fellow Mafia', value: allMafia });
        }
      }
      await user.send({ embeds: [embed] });
    } catch {
      failed.push(player.userId);
    }
  }
  return failed;
}

export async function sendNightActionDms(
  client: Client,
  game: MafiaGame,
): Promise<void> {
  const alive = alivePlayers(game);
  const aliveMafia = aliveByRole(game, 'mafia');
  const aliveNonMafia = alive.filter((p) => p.role !== 'mafia');

  for (const mafiaMember of aliveMafia) {
    try {
      const user = await client.users.fetch(mafiaMember.userId);
      const embed = new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle('🌙 Night — Choose a target to eliminate')
        .setDescription('Select a town player to eliminate tonight.');
      const rows = nightKillButtons(aliveNonMafia, game.guildId);
      if (rows.length > 0) {
        await user.send({ embeds: [embed], components: rows });
      }
    } catch {
      // DMs closed; night will resolve without their input
    }
  }

  const aliveDoctor = aliveByRole(game, 'doctor');
  for (const doctor of aliveDoctor) {
    try {
      const user = await client.users.fetch(doctor.userId);
      const embed = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle('🌙 Night — Choose a player to protect')
        .setDescription('Select a player to save from elimination tonight. You may protect yourself.');
      const rows = nightSaveButtons(alive, game.guildId);
      if (rows.length > 0) {
        await user.send({ embeds: [embed], components: rows });
      }
    } catch {
      // DMs closed
    }
  }
}

export async function postToThread(
  client: Client,
  game: MafiaGame,
  options: Parameters<TextChannel['send']>[0],
): Promise<void> {
  try {
    const channel = await client.channels.fetch(game.threadId) as ThreadChannel | null;
    if (channel && channel.isSendable()) {
      await channel.send(options);
    }
  } catch {
    // thread may be archived/deleted
  }
}

export async function handleNightDone(
  client: Client,
  guildId: string,
): Promise<void> {
  const { resolveNight } = await import('./phases.ts');
  await resolveNight(client, guildId);
}

export async function handleDayDone(
  client: Client,
  guildId: string,
): Promise<void> {
  const { resolveDay } = await import('./phases.ts');
  await resolveDay(client, guildId);
}
