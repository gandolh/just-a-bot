import {
  type AutocompleteInteraction,
  ChannelType,
  type ChatInputCommandInteraction,
  GuildMember,
  SlashCommandBuilder,
} from "discord.js";
import type { Command } from "./types.ts";
import { atriumFetch, JukeboxNotConfigured } from "../jukebox/atrium/client.ts";
import { isJukeboxConfigured } from "../jukebox/atrium/config.ts";
import {
  errorReply,
  nowPlayingText,
  queueText,
  repeatText,
  resolveTrack,
  trackChoices,
  type PlayerView,
} from "../jukebox/format.ts";
import type { Track } from "../jukebox/types.ts";

/**
 * `/jukebox`: the Discord remote for atrium's Jukebox. Atrium's
 * page is the other remote for the same Player. Every subcommand goes through
 * atrium, which sends the matching command down the bot's long-poll;
 * nothing changes here locally. Anyone in the guild may use it, and the
 * bot never posts on its own.
 */

/** Discord allows 3 seconds; each atrium call gets less, so a slow one still gets an answer. */
const CALL_TIMEOUT_MS = 2_500;
/** Past this, defer the reply rather than risk the 3-second limit. */
const DEFER_AFTER_MS = 1_500;
const TRACKS_CACHE_MS = 60_000;
const MAX_ADDED_BY = 64;

const data = new SlashCommandBuilder()
  .setName("jukebox")
  .setDescription("Play atrium's music in a voice channel")
  .addSubcommand((sub) =>
    sub
      .setName("play")
      .setDescription("Add a song to the queue, and start playing if nothing is")
      .addStringOption((o) =>
        o.setName("track").setDescription("Song title, artist or album").setRequired(true).setAutocomplete(true),
      )
      .addBooleanOption((o) => o.setName("next").setDescription("Play it next instead of at the end of the queue")),
  )
  .addSubcommand((sub) => sub.setName("skip").setDescription("Skip to the next song"))
  .addSubcommand((sub) => sub.setName("previous").setDescription("Go back to the previous song"))
  .addSubcommand((sub) => sub.setName("pause").setDescription("Pause"))
  .addSubcommand((sub) => sub.setName("resume").setDescription("Resume"))
  .addSubcommand((sub) => sub.setName("stop").setDescription("Stop playing (the queue stays)"))
  .addSubcommand((sub) => sub.setName("join").setDescription("Bring the bot into your voice channel"))
  .addSubcommand((sub) => sub.setName("leave").setDescription("Send the bot out of the voice channel"))
  .addSubcommand((sub) =>
    sub
      .setName("shuffle")
      .setDescription("Turn shuffle on or off")
      .addBooleanOption((o) => o.setName("on").setDescription("Shuffle on?").setRequired(true)),
  )
  .addSubcommand((sub) =>
    sub
      .setName("repeat")
      .setDescription("Repeat nothing, this song, or the whole playlist")
      .addStringOption((o) =>
        o
          .setName("mode")
          .setDescription("What to repeat")
          .setRequired(true)
          .addChoices(
            { name: "off", value: "off" },
            { name: "one song", value: "one" },
            { name: "the playlist", value: "all" },
          ),
      ),
  )
  .addSubcommand((sub) => sub.setName("nowplaying").setDescription("What's playing, and how far along"))
  .addSubcommand((sub) => sub.setName("queue").setDescription("What's playing and what's queued"));

let trackCache: { at: number; tracks: Track[] } | null = null;

/** The Playlist, cached for a minute: autocomplete fires on every keystroke. */
async function tracks(): Promise<Track[]> {
  if (trackCache && Date.now() - trackCache.at < TRACKS_CACHE_MS) return trackCache.tracks;
  const fresh = await atriumFetch<Track[]>("/jukebox/tracks", { timeoutMs: CALL_TIMEOUT_MS });
  trackCache = { at: Date.now(), tracks: fresh };
  return fresh;
}

const playerPath = (guildId: string) => `/jukebox/players/${guildId}`;

function getPlayer(guildId: string): Promise<PlayerView> {
  return atriumFetch<PlayerView>(playerPath(guildId), { timeoutMs: CALL_TIMEOUT_MS });
}

function control(guildId: string, body: Record<string, unknown>): Promise<PlayerView> {
  return atriumFetch<PlayerView>(`${playerPath(guildId)}/control`, {
    method: "POST",
    json: body,
    timeoutMs: CALL_TIMEOUT_MS,
  });
}

function settings(guildId: string, body: { shuffle?: boolean; repeat?: string }): Promise<PlayerView> {
  return atriumFetch<PlayerView>(`${playerPath(guildId)}/settings`, {
    method: "PATCH",
    json: body,
    timeoutMs: CALL_TIMEOUT_MS,
  });
}

/**
 * The invoker's current voice channel in this guild, if any, and whether the
 * bot can play there: a voice channel (not a stage) where it has Connect and
 * Speak and that is not full. `joinable` and `speakable` are discord.js's own
 * checks; atrium's page lists only channels with Connect and Speak.
 */
function invokerChannel(
  interaction: ChatInputCommandInteraction,
): { id: string; name: string; usable: boolean } | null {
  const member = interaction.member;
  const channel = member instanceof GuildMember ? member.voice.channel : null;
  if (!channel) return null;
  const usable = channel.type === ChannelType.GuildVoice && channel.joinable && channel.speakable;
  return { id: channel.id, name: channel.name, usable };
}

const cantJoin = (name: string) => `I can't join **${name}**. I need Connect and Speak there, and room in the channel.`;

function invokerName(interaction: ChatInputCommandInteraction): string {
  const member = interaction.member;
  const name = member instanceof GuildMember ? member.displayName : interaction.user.displayName;
  return name.slice(0, MAX_ADDED_BY);
}

export interface Answer {
  content: string;
  /** Public for a successful control; `queue`, `nowplaying` and every error are ephemeral. */
  public: boolean;
}

/** The parts of an interaction `answer` uses. */
export type Answerable = Pick<
  ChatInputCommandInteraction,
  "reply" | "deferReply" | "editReply" | "followUp" | "deleteReply"
>;

/**
 * Run the work and answer within Discord's 3 seconds. A slow call (a first
 * sign-in, say) defers ephemerally, so errors stay ephemeral either way.
 *
 * Discord fills a still-loading deferred reply with the first follow-up and
 * keeps its ephemeral flag (its interaction docs, "deprecated" but live), so a
 * follow-up straight after the defer would be ephemeral, and deleting the
 * placeholder would then delete the answer. So the placeholder is filled in
 * first; a public answer then goes out as a real follow-up, and the
 * ephemeral copy is removed only once that follow-up is posted.
 */
export async function answer(
  interaction: Answerable,
  work: () => Promise<Answer>,
  deferAfterMs = DEFER_AFTER_MS,
): Promise<void> {
  // A property, not a `let`: the type checker doesn't see a callback assign a `let`, and would read
  // `deferring` as always null below.
  const deferral: { deferring: Promise<unknown> | null } = { deferring: null };
  const timer = setTimeout(() => {
    deferral.deferring = interaction.deferReply({ ephemeral: true }).catch(() => {});
  }, deferAfterMs);
  let result: Answer;
  try {
    result = await work();
  } catch (err) {
    result = { content: errorReply(err), public: false };
  }
  clearTimeout(timer);
  if (!deferral.deferring) {
    await interaction.reply({ content: result.content, ephemeral: !result.public });
    return;
  }
  await deferral.deferring;
  await interaction.editReply({ content: result.content });
  if (result.public) {
    await interaction.followUp({ content: result.content });
    await interaction.deleteReply().catch(() => {});
  }
}

const say = (content: string): Answer => ({ content, public: true });
const tell = (content: string): Answer => ({ content, public: false });

export const jukebox: Command = {
  data,

  async execute(interaction) {
    if (!interaction.inGuild()) {
      await interaction.reply({ content: "Use this in a server.", ephemeral: true });
      return;
    }
    const guildId = interaction.guildId;
    const sub = interaction.options.getSubcommand();

    await answer(interaction, async () => {
      if (!isJukeboxConfigured()) throw new JukeboxNotConfigured();

      switch (sub) {
        case "play": {
          const picked = resolveTrack(await tracks(), interaction.options.getString("track", true));
          if (!picked) return tell("That isn't a song in the library. Pick one from the list.");
          let player = await getPlayer(guildId);
          if (!player.online) return tell("The player is offline.");
          if (!player.voiceChannel) {
            const channel = invokerChannel(interaction);
            if (!channel) return tell("Join a voice channel first, or use `/jukebox join`.");
            if (!channel.usable) return tell(cantJoin(channel.name));
            await control(guildId, { action: "join", channelId: channel.id });
          }
          const next = interaction.options.getBoolean("next") ?? false;
          player = await atriumFetch<PlayerView>(`${playerPath(guildId)}/queue`, {
            method: "POST",
            json: { bookId: picked.id, at: next ? "next" : "end", addedBy: { name: invokerName(interaction) } },
            timeoutMs: CALL_TIMEOUT_MS,
          });
          if (player.state === "idle") await control(guildId, { action: "play" });
          return say(next ? `*${picked.title}* plays next.` : `Added *${picked.title}* to the queue.`);
        }
        case "skip":
          await control(guildId, { action: "next" });
          return say("Skipped.");
        case "previous":
          await control(guildId, { action: "previous" });
          return say("Back to the previous song.");
        case "pause":
          await control(guildId, { action: "pause" });
          return say("Paused.");
        case "resume":
          await control(guildId, { action: "resume" });
          return say("Resumed.");
        case "stop":
          await control(guildId, { action: "stop" });
          return say("Stopped.");
        case "join": {
          const channel = invokerChannel(interaction);
          if (!channel) return tell("Join a voice channel first.");
          if (!channel.usable) return tell(cantJoin(channel.name));
          await control(guildId, { action: "join", channelId: channel.id });
          return say(`Joining **${channel.name}**.`);
        }
        case "leave":
          await control(guildId, { action: "leave" });
          return say("Left the voice channel.");
        case "shuffle": {
          const on = interaction.options.getBoolean("on", true);
          await settings(guildId, { shuffle: on });
          return say(on ? "Shuffle is on." : "Shuffle is off.");
        }
        case "repeat": {
          const mode = interaction.options.getString("mode", true) as "off" | "one" | "all";
          await settings(guildId, { repeat: mode });
          return say(repeatText(mode));
        }
        case "nowplaying":
          return tell(nowPlayingText(await getPlayer(guildId), Date.now()));
        case "queue":
          return tell(queueText(await getPlayer(guildId), Date.now()));
        default:
          return tell("Unknown subcommand.");
      }
    });
  },

  async autocomplete(interaction: AutocompleteInteraction) {
    // Never throws: an unreachable atrium is an empty list.
    let choices: { name: string; value: string }[] = [];
    if (isJukeboxConfigured()) {
      try {
        choices = trackChoices(await tracks(), interaction.options.getFocused());
      } catch {
        choices = [];
      }
    }
    await interaction.respond(choices).catch(() => {});
  },
};
