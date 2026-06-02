import {
  ButtonInteraction,
  ChannelType,
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
  TextChannel,
  ThreadChannel,
} from 'discord.js';
import type { Command } from './types.ts';
import {
  createGame,
  deleteGame,
  loadGame,
  updateGame,
} from '../mafia/store.ts';
import type { MafiaGame } from '../mafia/store.ts';
import { alivePlayers, assignRoles, checkWin } from '../mafia/roles.ts';
import {
  dayEmbed,
  gameStartedEmbed,
  joinButton,
  lobbyEmbed,
} from '../mafia/render.ts';
import { cancelTimers, startDay } from '../mafia/phases.ts';
import { sendRoleDms } from '../mafia/dm.ts';

const MIN_PLAYERS = 5;

const data = new SlashCommandBuilder()
  .setName('mafia')
  .setDescription('Play Mafia in a Discord thread')
  .addSubcommand((s) =>
    s.setName('start').setDescription('Create a game thread and open a 60s lobby'),
  )
  .addSubcommand((s) =>
    s.setName('join').setDescription('Join the current lobby'),
  )
  .addSubcommand((s) =>
    s.setName('start-now').setDescription('Force-start the game (starter only, min 5 players)'),
  )
  .addSubcommand((s) =>
    s.setName('vote')
      .setDescription('Cast or change your day-phase vote')
      .addUserOption((o) =>
        o.setName('target').setDescription('Player to vote for').setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s.setName('status').setDescription('Show current phase, alive players, day number'),
  )
  .addSubcommand((s) =>
    s.setName('cancel').setDescription('Cancel the in-progress game (starter or admin)'),
  );

export const mafia: Command = {
  data,
  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inGuild()) {
      await replyEphemeral(interaction, 'Use this in a server.');
      return;
    }
    const sub = interaction.options.getSubcommand();
    switch (sub) {
      case 'start': return handleStart(interaction);
      case 'join': return handleJoin(interaction);
      case 'start-now': return handleStartNow(interaction);
      case 'vote': return handleVote(interaction);
      case 'status': return handleStatus(interaction);
      case 'cancel': return handleCancel(interaction);
    }
  },
};

// ── Handlers ───────────────────────────────────────────────────────────────

async function handleStart(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId!;
  const existing = await loadGame(guildId);
  if (existing && existing.phase !== 'finished') {
    await replyEphemeral(interaction, 'A Mafia game is already running in this server. Use `/mafia cancel` to end it first.');
    return;
  }

  await interaction.deferReply();

  const channel = interaction.channel;
  if (!channel || channel.type !== ChannelType.GuildText) {
    await interaction.editReply({ content: 'Mafia can only be started in a standard text channel.' });
    return;
  }

  let thread: ThreadChannel | null = null;
  try {
    thread = await (channel as TextChannel).threads.create({
      name: 'Mafia Game',
      autoArchiveDuration: 60,
      type: ChannelType.PublicThread,
    });
  } catch {
    await interaction.editReply({ content: 'Could not create a thread. Make sure the bot has the Manage Threads permission.' });
    return;
  }

  if (!thread) {
    await interaction.editReply({ content: 'Could not create a thread.' });
    return;
  }

  const game = await createGame(guildId, thread.id, interaction.user.id, interaction.channelId);

  const embed = lobbyEmbed(game);
  const row = joinButton(guildId);
  await thread.send({ embeds: [embed], components: [row] });

  await interaction.editReply({ content: `Mafia game lobby opened in ${thread}!` });

  setTimeout(() => {
    void lobbyExpire(interaction.client, guildId);
  }, 60_000);
}

async function handleJoin(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId!;
  const game = await loadGame(guildId);
  if (!game || game.phase !== 'lobby') {
    await replyEphemeral(interaction, 'No open Mafia lobby right now. Start one with `/mafia start`.');
    return;
  }
  if (game.players[interaction.user.id]) {
    await replyEphemeral(interaction, 'You are already in the lobby.');
    return;
  }

  await updateGame(guildId, (g) => {
    g.players[interaction.user.id] = {
      userId: interaction.user.id,
      tag: interaction.user.username,
      role: null,
      alive: true,
    };
  });

  await replyEphemeral(interaction, 'You have joined the Mafia lobby!');
  await refreshLobbyMessage(interaction.client, guildId);
}

async function handleStartNow(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId!;
  const game = await loadGame(guildId);
  if (!game || game.phase !== 'lobby') {
    await replyEphemeral(interaction, 'No open lobby to start.');
    return;
  }
  if (game.starterId !== interaction.user.id) {
    await replyEphemeral(interaction, 'Only the game starter can force-start.');
    return;
  }
  const count = Object.keys(game.players).length;
  if (count < MIN_PLAYERS) {
    await replyEphemeral(interaction, `Need at least ${MIN_PLAYERS} players (have ${count}).`);
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  await launchGame(interaction.client, guildId);
  await interaction.editReply({ content: 'Game started!' });
}

async function handleVote(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId!;
  const game = await loadGame(guildId);
  if (!game || game.phase !== 'day') {
    await replyEphemeral(interaction, 'No active day phase.');
    return;
  }
  const voter = game.players[interaction.user.id];
  if (!voter || !voter.alive) {
    await replyEphemeral(interaction, 'You are not an alive player in this game.');
    return;
  }
  const target = interaction.options.getUser('target', true);
  const targetPlayer = game.players[target.id];
  if (!targetPlayer || !targetPlayer.alive) {
    await replyEphemeral(interaction, 'That player is not alive in this game.');
    return;
  }
  if (target.id === interaction.user.id) {
    await replyEphemeral(interaction, 'You cannot vote for yourself.');
    return;
  }

  let voteCount = 0;
  await updateGame(guildId, (g) => {
    g.votes = g.votes.filter((v) => v.voterId !== interaction.user.id);
    g.votes.push({ voterId: interaction.user.id, targetId: target.id });
    voteCount = g.votes.filter((v) => v.targetId === target.id).length;
  });

  const alive = alivePlayers(game);
  await interaction.reply({
    content: `<@${interaction.user.id}> → <@${target.id}> (${voteCount}/${alive.length})`,
  });

  const updated = await loadGame(guildId);
  if (!updated || updated.phase !== 'day') return;

  const threshold = Math.floor(alivePlayers(updated).length / 2) + 1;
  const votes = updated.votes.filter((v) => v.targetId === target.id).length;
  if (votes >= threshold) {
    const { resolveDay } = await import('../mafia/phases.ts');
    await resolveDay(interaction.client, guildId);
  }
}

async function handleStatus(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId!;
  const game = await loadGame(guildId);
  if (!game || game.phase === 'finished') {
    await replyEphemeral(interaction, 'No active Mafia game.');
    return;
  }
  const alive = alivePlayers(game);
  const lines = [
    `**Phase:** ${game.phase}`,
    `**Day:** ${game.day}`,
    `**Alive (${alive.length}):** ${alive.map((p) => `<@${p.userId}>`).join(', ')}`,
  ];
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('Mafia — Status')
    .setDescription(lines.join('\n'));
  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

async function handleCancel(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId!;
  const game = await loadGame(guildId);
  if (!game || game.phase === 'finished') {
    await replyEphemeral(interaction, 'No active Mafia game to cancel.');
    return;
  }
  const member = interaction.member;
  const isAdmin = member && 'permissions' in member &&
    (member.permissions as { has: (p: string) => boolean }).has('Administrator');
  if (game.starterId !== interaction.user.id && !isAdmin) {
    await replyEphemeral(interaction, 'Only the game starter or an admin can cancel.');
    return;
  }

  cancelTimers(guildId);
  await deleteGame(guildId);
  await interaction.reply({ content: '🛑 Mafia game cancelled.' });
}

// ── Button handler ─────────────────────────────────────────────────────────

export async function handleMafiaButton(interaction: ButtonInteraction): Promise<void> {
  const parts = interaction.customId.split(':');
  const action = parts[1];

  if (action === 'join') {
    const guildId = parts[2];
    await handleJoinButton(interaction, guildId);
    return;
  }

  if (action === 'kill' || action === 'save') {
    const guildId = parts[2];
    const targetId = parts[3];
    await handleNightActionButton(interaction, guildId, action, targetId);
    return;
  }

  await interaction.reply({ content: 'Unknown action.', ephemeral: true });
}

async function handleJoinButton(interaction: ButtonInteraction, guildId: string): Promise<void> {
  const game = await loadGame(guildId);
  if (!game || game.phase !== 'lobby') {
    await interaction.reply({ content: 'The lobby is no longer open.', ephemeral: true });
    return;
  }
  if (game.players[interaction.user.id]) {
    await interaction.reply({ content: 'You are already in the lobby.', ephemeral: true });
    return;
  }

  await updateGame(guildId, (g) => {
    g.players[interaction.user.id] = {
      userId: interaction.user.id,
      tag: interaction.user.username,
      role: null,
      alive: true,
    };
  });

  await interaction.reply({ content: 'You joined the Mafia lobby!', ephemeral: true });
  await refreshLobbyMessage(interaction.client, guildId);
}

async function handleNightActionButton(
  interaction: ButtonInteraction,
  guildId: string,
  action: 'kill' | 'save',
  targetId: string,
): Promise<void> {
  const game = await loadGame(guildId);
  if (!game || game.phase !== 'night') {
    await interaction.reply({ content: 'Night phase is not active.', ephemeral: true });
    return;
  }

  const actor = game.players[interaction.user.id];
  if (!actor || !actor.alive) {
    await interaction.reply({ content: 'You are not an alive player.', ephemeral: true });
    return;
  }

  const expectedKind = action === 'kill' ? 'mafia' : 'doctor';
  if (actor.role !== expectedKind) {
    await interaction.reply({ content: 'That action is not for your role.', ephemeral: true });
    return;
  }

  const target = game.players[targetId];
  if (!target || !target.alive) {
    await interaction.reply({ content: 'That player is no longer alive.', ephemeral: true });
    return;
  }

  await updateGame(guildId, (g) => {
    g.nightActions = g.nightActions.filter((a) => !(a.actorId === interaction.user.id && a.kind === action));
    g.nightActions.push({ actorId: interaction.user.id, kind: action, targetId });
  });

  await interaction.reply({
    content: `Your choice has been recorded: **${action}** → <@${targetId}>`,
    ephemeral: true,
  });

  const { checkNightComplete } = await import('../mafia/phases.ts');
  await checkNightComplete(interaction.client, guildId);
}

// ── Internal helpers ───────────────────────────────────────────────────────

async function lobbyExpire(client: import('discord.js').Client, guildId: string): Promise<void> {
  const game = await loadGame(guildId);
  if (!game || game.phase !== 'lobby') return;

  const count = Object.keys(game.players).length;
  if (count < MIN_PLAYERS) {
    await deleteGame(guildId);
    try {
      const thread = await client.channels.fetch(game.threadId) as ThreadChannel | null;
      if (thread && thread.isSendable()) {
        await thread.send({
          content: `❌ Lobby expired with only ${count}/${MIN_PLAYERS} players. Game cancelled.`,
        });
      }
    } catch {
      // thread gone
    }
    return;
  }

  await launchGame(client, guildId);
}

async function launchGame(client: import('discord.js').Client, guildId: string): Promise<void> {
  const game = await loadGame(guildId);
  if (!game || game.phase !== 'lobby') return;

  const players = Object.values(game.players);
  assignRoles(players);

  await updateGame(guildId, (g) => {
    for (const p of players) {
      g.players[p.userId].role = p.role;
    }
  });

  const updated = await loadGame(guildId);
  if (!updated) return;

  const failed = await sendRoleDms(client, updated);
  if (failed.length > 0) {
    try {
      const thread = await client.channels.fetch(updated.threadId) as ThreadChannel | null;
      if (thread && thread.isSendable()) {
        const mentions = failed.map((id) => `<@${id}>`).join(', ');
        await thread.send({
          content: `⚠️ Could not DM the following players (DMs likely closed): ${mentions}. They have been removed from the game.`,
        });
      }
    } catch {
      // ignore
    }

    await updateGame(guildId, (g) => {
      for (const uid of failed) {
        delete g.players[uid];
      }
    });

    const afterRemoval = await loadGame(guildId);
    if (!afterRemoval) return;
    const remaining = Object.keys(afterRemoval.players).length;
    if (remaining < MIN_PLAYERS) {
      await deleteGame(guildId);
      try {
        const thread = await client.channels.fetch(afterRemoval.threadId) as ThreadChannel | null;
        if (thread && thread.isSendable()) {
          await thread.send({ content: `❌ Not enough players after removing DM-closed users. Game cancelled.` });
        }
      } catch {
        // ignore
      }
      return;
    }
  }

  const finalGame = await loadGame(guildId);
  if (!finalGame) return;

  try {
    const thread = await client.channels.fetch(finalGame.threadId) as ThreadChannel | null;
    if (thread && thread.isSendable()) {
      await thread.send({ embeds: [gameStartedEmbed(finalGame)] });
    }
  } catch {
    // ignore
  }

  const win = checkWin(finalGame);
  if (win) {
    const { endGame } = await import('../mafia/phases.ts');
    await endGame(client, guildId, win);
    return;
  }

  await startDay(client, guildId);
}

async function refreshLobbyMessage(
  client: import('discord.js').Client,
  guildId: string,
): Promise<void> {
  const game = await loadGame(guildId);
  if (!game || game.phase !== 'lobby') return;

  try {
    const thread = await client.channels.fetch(game.threadId) as ThreadChannel | null;
    if (!thread || !thread.isSendable()) return;

    const messages = await thread.messages.fetch({ limit: 10 });
    const lobbyMsg = messages.find(
      (m) => m.author.id === client.user?.id && m.components.length > 0,
    );
    if (lobbyMsg) {
      await lobbyMsg.edit({ embeds: [lobbyEmbed(game)], components: [joinButton(guildId)] });
    }
  } catch {
    // ignore
  }
}

async function replyEphemeral(interaction: ChatInputCommandInteraction, content: string): Promise<void> {
  await interaction.reply({ content, flags: MessageFlags.Ephemeral });
}
