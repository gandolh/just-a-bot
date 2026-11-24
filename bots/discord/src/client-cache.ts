import { Options, type ClientOptions, type GuildMember, type Message, type User } from "discord.js";

// How much of Discord the bot remembers between events. discord.js keeps 200 messages per channel and
// every member and user it ever sees until the next restart, which is only on a deploy. Kept apart from
// index.ts so a test can import it without loading the .env.

export const MESSAGES_PER_CHANNEL = 25;
const SWEEP_INTERVAL_SECONDS = 3600;
const MESSAGE_LIFETIME_SECONDS = 1800;

// A member in a voice channel stays: the Jukebox counts listeners from voice-channel members and their users.
export function keepMember(member: Pick<GuildMember, "id" | "voice" | "client">): boolean {
  return member.id === member.client.user?.id || member.voice.channelId !== null;
}

export function keepUser(user: Pick<User, "id" | "client">): boolean {
  const { client } = user;
  if (user.id === client.user?.id) return true;
  return client.guilds.cache.some((guild) => guild.voiceStates.cache.has(user.id));
}

export function messageIsStale(message: Pick<Message, "editedTimestamp" | "createdTimestamp">, now: number): boolean {
  return now - (message.editedTimestamp ?? message.createdTimestamp) > MESSAGE_LIFETIME_SECONDS * 1000;
}

export const clientCacheOptions: Pick<ClientOptions, "makeCache" | "sweepers"> = {
  makeCache: Options.cacheWithLimits({ ...Options.DefaultMakeCacheSettings, MessageManager: MESSAGES_PER_CHANNEL }),
  sweepers: {
    ...Options.DefaultSweeperSettings,
    messages: {
      interval: SWEEP_INTERVAL_SECONDS,
      filter: () => (message: Message) => messageIsStale(message, Date.now()),
    },
    guildMembers: {
      interval: SWEEP_INTERVAL_SECONDS,
      filter: () => (member: GuildMember) => !keepMember(member),
    },
    users: {
      interval: SWEEP_INTERVAL_SECONDS,
      filter: () => (user: User) => !keepUser(user),
    },
  },
};
