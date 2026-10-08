import type { Readable } from 'node:stream';
import {
  AudioPlayerStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  joinVoiceChannel,
  NoSubscriberBehavior,
  StreamType,
  VoiceConnectionStatus,
  type AudioResource,
  type VoiceConnection,
} from '@discordjs/voice';
import { ChannelType, Events, PermissionFlagsBits, type Client, type Guild } from 'discord.js';
import { logger } from '@bots/shared';

const log = logger.scoped('jukebox');

/**
 * The voice side of the Jukebox, one per guild (brief 26). The link and the
 * player only know this interface, so they run unchanged against a stand-in
 * when there is no Discord to talk to; `DiscordSpeaker` below is the real one.
 */
export interface VoiceChannelInfo {
  id: string;
  name: string;
}

export interface SpeakerHandlers {
  /** The Track finished on its own: not stopped, not replaced. */
  ended?: () => void;
  error?: (err: Error) => void;
  /** People (not bots) in the bot's channel; `null` when it is in none. */
  listeners?: (humans: number | null) => void;
  /** The guild's voice channels changed. */
  channels?: () => void;
  /** The voice connection is gone, and not coming back by itself. */
  disconnected?: () => void;
}

export interface Speaker {
  readonly guildId: string;
  guildName(): string;
  /** The guild's voice channels where the bot may connect and speak. */
  voiceChannels(): VoiceChannelInfo[];
  /** The channel the bot is connected to, or null. */
  connected(): VoiceChannelInfo | null;
  /** Join (or move to) a channel. Resolves once the connection is ready to send audio. */
  join(channelId: string): Promise<void>;
  leave(): void;
  /** Play an Ogg Opus stream, replacing whatever is playing. */
  play(source: Readable): void;
  pause(): void;
  resume(): void;
  stop(): void;
  /** Milliseconds into the current Track. */
  positionMs(): number;
  setHandlers(handlers: SpeakerHandlers): void;
}

/** What the link needs from the bot: its guilds, and a Speaker for each. */
export interface JukeboxHost {
  guilds(): { id: string; name: string }[];
  speaker(guildId: string): Speaker;
}

const READY_TIMEOUT_MS = 20_000;
const RECONNECT_GRACE_MS = 5_000;

class DiscordSpeaker implements Speaker {
  private connection: VoiceConnection | null = null;
  private resource: AudioResource | null = null;
  private stopping = false;
  private handlers: SpeakerHandlers = {};
  private readonly player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Pause } });

  constructor(
    private readonly client: Client,
    readonly guildId: string,
  ) {
    this.player.on(AudioPlayerStatus.Idle, () => {
      const deliberate = this.stopping;
      this.stopping = false;
      this.resource = null;
      if (!deliberate) this.handlers.ended?.();
    });
    this.player.on('error', (err) => this.handlers.error?.(err));
  }

  private guild(): Guild | undefined {
    return this.client.guilds.cache.get(this.guildId);
  }

  setHandlers(handlers: SpeakerHandlers): void {
    this.handlers = handlers;
  }

  guildName(): string {
    return this.guild()?.name ?? this.guildId;
  }

  voiceChannels(): VoiceChannelInfo[] {
    const guild = this.guild();
    const me = guild?.members.me;
    if (!guild || !me) return [];
    return guild.channels.cache
      .filter(
        (channel) =>
          channel.type === ChannelType.GuildVoice &&
          channel.permissionsFor(me).has([PermissionFlagsBits.Connect, PermissionFlagsBits.Speak]),
      )
      .map((channel) => ({ id: channel.id, name: channel.name }));
  }

  connected(): VoiceChannelInfo | null {
    const channelId = this.connection?.joinConfig.channelId;
    if (!this.connection || !channelId || this.connection.state.status === VoiceConnectionStatus.Destroyed) return null;
    return { id: channelId, name: this.guild()?.channels.cache.get(channelId)?.name ?? '' };
  }

  async join(channelId: string): Promise<void> {
    const guild = this.guild();
    if (!guild) throw new Error(`the bot is not in guild ${this.guildId}`);
    const connection = joinVoiceChannel({
      channelId,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: true,
    });
    if (connection !== this.connection) {
      this.connection = connection;
      connection.subscribe(this.player);
      // The voice guide's recipe: a Disconnected that does not start
      // reconnecting within a few seconds is a real disconnect (kicked,
      // channel deleted), not a region move.
      connection.on(VoiceConnectionStatus.Disconnected, () => {
        Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, RECONNECT_GRACE_MS),
          entersState(connection, VoiceConnectionStatus.Connecting, RECONNECT_GRACE_MS),
        ]).catch(() => {
          if (connection.state.status !== VoiceConnectionStatus.Destroyed) connection.destroy();
        });
      });
      connection.on(VoiceConnectionStatus.Destroyed, () => {
        if (this.connection === connection) {
          this.connection = null;
          this.stop();
          this.handlers.disconnected?.();
        }
      });
    }
    await entersState(connection, VoiceConnectionStatus.Ready, READY_TIMEOUT_MS);
    this.membersChanged();
  }

  leave(): void {
    const connection = this.connection;
    this.connection = null;
    this.stop();
    if (connection && connection.state.status !== VoiceConnectionStatus.Destroyed) connection.destroy();
    this.handlers.listeners?.(null);
  }

  play(source: Readable): void {
    this.stopping = false;
    this.resource = createAudioResource(source, { inputType: StreamType.OggOpus });
    this.player.play(this.resource);
  }

  pause(): void {
    this.player.pause();
  }

  resume(): void {
    this.player.unpause();
  }

  stop(): void {
    // Only a stop that will actually produce an Idle may swallow it; otherwise
    // the flag would eat the next Track's natural end.
    if (this.player.state.status !== AudioPlayerStatus.Idle) {
      this.stopping = true;
      this.player.stop(true);
    }
  }

  positionMs(): number {
    return this.resource?.playbackDuration ?? 0;
  }

  /** Recount the people in the bot's channel. */
  membersChanged(): void {
    const channelId = this.connected()?.id;
    if (!channelId) return;
    const channel = this.guild()?.channels.cache.get(channelId);
    if (!channel || !channel.isVoiceBased()) return;
    this.handlers.listeners?.(channel.members.filter((member) => !member.user.bot).size);
  }

  channelsChanged(): void {
    this.handlers.channels?.();
  }
}

/** The Jukebox's view of the real Discord client. Needs the GuildVoiceStates intent. */
export function discordHost(client: Client): JukeboxHost {
  const speakers = new Map<string, DiscordSpeaker>();
  client.on(Events.VoiceStateUpdate, (before, after) => {
    speakers.get(after.guild.id)?.membersChanged();
    if (before.guild.id !== after.guild.id) speakers.get(before.guild.id)?.membersChanged();
  });
  const channelEvent = (channel: { guildId?: string | null; isVoiceBased?: () => boolean }) => {
    if (channel.guildId && channel.isVoiceBased?.()) speakers.get(channel.guildId)?.channelsChanged();
  };
  client.on(Events.ChannelCreate, channelEvent);
  client.on(Events.ChannelDelete, (channel) => channelEvent(channel as never));
  client.on(Events.ChannelUpdate, (_before, after) => channelEvent(after as never));
  return {
    guilds: () => client.guilds.cache.map((guild) => ({ id: guild.id, name: guild.name })),
    speaker: (guildId) => {
      let speaker = speakers.get(guildId);
      if (!speaker) {
        speaker = new DiscordSpeaker(client, guildId);
        speakers.set(guildId, speaker);
        log.debug(`voice ready for guild ${guildId}`);
      }
      return speaker;
    },
  };
}
