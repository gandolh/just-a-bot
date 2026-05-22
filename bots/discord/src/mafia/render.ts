import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import type { MafiaGame, Player, Role } from './store.ts';
import { alivePlayers } from './roles.ts';

const LOBBY_COLOR = 0x5865f2;
const DAY_COLOR = 0xfaa61a;
const NIGHT_COLOR = 0x2c2f33;
const WIN_COLOR = 0x57f287;
const DEAD_COLOR = 0xed4245;

export function lobbyEmbed(game: MafiaGame): EmbedBuilder {
  const players = Object.values(game.players);
  const list = players.length
    ? players.map((p) => `• <@${p.userId}>`).join('\n')
    : '_No players yet — click Join or use `/mafia join`_';
  return new EmbedBuilder()
    .setColor(LOBBY_COLOR)
    .setTitle('🎭 Mafia — Lobby Open')
    .setDescription(
      [
        `Started by <@${game.starterId}>`,
        '',
        `**Players (${players.length}):**`,
        list,
        '',
        `Lobby closes <t:${Math.floor(new Date(game.lobbyExpiresAt!).getTime() / 1000)}:R> or when the host runs \`/mafia start-now\` (min 5 players).`,
      ].join('\n'),
    );
}

export function joinButton(guildId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`maf:join:${guildId}`)
      .setLabel('Join Game')
      .setStyle(ButtonStyle.Primary),
  );
}

export function gameStartedEmbed(game: MafiaGame): EmbedBuilder {
  const count = Object.keys(game.players).length;
  return new EmbedBuilder()
    .setColor(DAY_COLOR)
    .setTitle(`☀️ Day ${game.day} — The game begins`)
    .setDescription(
      [
        `**${count} players** have gathered. Roles have been assigned via DM.`,
        '',
        'Discuss, deliberate, and vote with `/mafia vote target:@user`.',
        'A majority vote eliminates a player. The day ends after 5 minutes.',
      ].join('\n'),
    );
}

export function dayEmbed(game: MafiaGame): EmbedBuilder {
  const alive = alivePlayers(game);
  const list = alive.map((p) => `• <@${p.userId}>`).join('\n');
  const votes = formatVotes(game);
  return new EmbedBuilder()
    .setColor(DAY_COLOR)
    .setTitle(`☀️ Day ${game.day}`)
    .setDescription(
      [
        `**Alive (${alive.length}):**`,
        list,
        '',
        votes ? `**Votes:**\n${votes}` : '_No votes yet._',
      ].join('\n'),
    );
}

function formatVotes(game: MafiaGame): string {
  if (game.votes.length === 0) return '';
  const tally = new Map<string, string[]>();
  for (const v of game.votes) {
    if (!tally.has(v.targetId)) tally.set(v.targetId, []);
    tally.get(v.targetId)!.push(v.voterId);
  }
  return Array.from(tally.entries())
    .sort((a, b) => b[1].length - a[1].length)
    .map(([targetId, voterIds]) => `<@${targetId}> ← ${voterIds.map((v) => `<@${v}>`).join(', ')} (${voterIds.length})`)
    .join('\n');
}

export function eliminatedEmbed(player: Player, game: MafiaGame): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(DEAD_COLOR)
    .setTitle(`⚰️ ${player.tag} has been eliminated`)
    .setDescription(`The town has spoken. <@${player.userId}> was the **${player.role}**.`);
}

export function nightEmbed(game: MafiaGame): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(NIGHT_COLOR)
    .setTitle(`🌙 Night ${game.day}`)
    .setDescription(
      [
        'The town sleeps. Role players — check your DMs to take your night action.',
        'The night ends in 2 minutes or when all actions are submitted.',
      ].join('\n'),
    );
}

export function nightResultEmbed(killed: Player | null, savedMessage: boolean): EmbedBuilder {
  if (savedMessage || !killed) {
    return new EmbedBuilder()
      .setColor(DAY_COLOR)
      .setTitle('☀️ Morning — A peaceful night')
      .setDescription('The night passed without incident. Everyone woke up safely.');
  }
  return new EmbedBuilder()
    .setColor(DEAD_COLOR)
    .setTitle(`☀️ Morning — A body was found`)
    .setDescription(`<@${killed.userId}> (**${killed.tag}**) was found dead. They were the **${killed.role}**.`);
}

export function winEmbed(winner: 'town' | 'mafia', game: MafiaGame): EmbedBuilder {
  const isTown = winner === 'town';
  const desc = isTown
    ? 'All mafia members have been eliminated. The town is safe!'
    : 'The mafia now outnumbers the town. Darkness wins.';
  const allPlayers = Object.values(game.players);
  const roleLines = allPlayers.map((p) => `<@${p.userId}> — **${p.role}**${p.alive ? '' : ' (eliminated)'}`).join('\n');
  return new EmbedBuilder()
    .setColor(isTown ? WIN_COLOR : DEAD_COLOR)
    .setTitle(isTown ? '🎉 Town wins!' : '🩸 Mafia wins!')
    .setDescription(`${desc}\n\n**Full role reveal:**\n${roleLines}`);
}

export function roleDmEmbed(role: Role, gameGuildId: string): EmbedBuilder {
  const descriptions: Record<Role, string> = {
    mafia: 'You are **Mafia**. Each night, coordinate with your fellow mafia members to eliminate a town player. Stay hidden during the day.',
    town: 'You are a **Town** member. Use discussion and voting to find and eliminate the mafia.',
    doctor: 'You are the **Doctor**. Each night, choose one player to protect from elimination.',
  };
  return new EmbedBuilder()
    .setColor(role === 'mafia' ? DEAD_COLOR : role === 'doctor' ? WIN_COLOR : LOBBY_COLOR)
    .setTitle(`Your role: ${role.charAt(0).toUpperCase() + role.slice(1)}`)
    .setDescription(descriptions[role]);
}

export function nightKillButtons(
  targets: Player[],
  guildId: string,
): ActionRowBuilder<ButtonBuilder>[] {
  return chunkButtons(
    targets.map((t) =>
      new ButtonBuilder()
        .setCustomId(`maf:kill:${guildId}:${t.userId}`)
        .setLabel(t.tag)
        .setStyle(ButtonStyle.Danger),
    ),
  );
}

export function nightSaveButtons(
  targets: Player[],
  guildId: string,
): ActionRowBuilder<ButtonBuilder>[] {
  return chunkButtons(
    targets.map((t) =>
      new ButtonBuilder()
        .setCustomId(`maf:save:${guildId}:${t.userId}`)
        .setLabel(t.tag)
        .setStyle(ButtonStyle.Success),
    ),
  );
}

function chunkButtons(buttons: ButtonBuilder[]): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < buttons.length; i += 5) {
    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(buttons.slice(i, i + 5)));
  }
  return rows;
}
