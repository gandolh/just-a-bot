import {
  JukeboxForbidden,
  JukeboxNotConfigured,
  JukeboxRequestError,
  JukeboxSignInFailed,
  JukeboxUnavailable,
} from "./atrium/errors.ts";
import type { Track } from "./types.ts";

/**
 * Pure helpers for `/jukebox`: autocomplete matching and reply
 * text. No discord.js here, so they are tested on their own.
 */

/** The part of atrium's `Player` the replies read. */
export interface PlayerView {
  online: boolean;
  state: "idle" | "playing" | "paused";
  voiceChannel: { id: string; name: string } | null;
  track: Track | null;
  positionMs: number;
  positionAt: string | null;
  shuffle: boolean;
  repeat: "off" | "one" | "all";
  queue: { id: number; track: Track; addedBy: { kind: "profile" | "discord"; name: string } }[];
  upcoming: Track[];
  /** Why playback gave up after atrium's run of failed songs; null otherwise. The next play clears it. */
  failure: string | null;
}

/** Discord's limits on autocomplete. */
export const MAX_CHOICES = 25;
const MAX_CHOICE_NAME = 100;
/** How many Queue entries `/jukebox queue` lists. */
export const QUEUE_SHOWN = 10;
/** Discord refuses a message over 2000 characters; stay under it with room for the "…and N more" line. */
export const REPLY_BUDGET = 1900;
/** How long each field of a reply's song line may be. ID3 tags from classical or soundtrack albums run to hundreds. */
const MAX_FIELD = { title: 60, artist: 40, album: 40, name: 32, failure: 200 } as const;

/** Cut to `max` characters with an ellipsis. Counts code points, so an emoji is never split. */
export function clip(text: string, max: number): string {
  const chars = [...text];
  return chars.length <= max ? text : `${chars.slice(0, max - 1).join("")}…`;
}

/** "Title · Artist", or the title alone, cut to Discord's 100 characters. */
export function choiceLabel(track: Track): string {
  const label = track.artist ? `${track.title} · ${track.artist}` : track.title;
  return label.length <= MAX_CHOICE_NAME ? label : `${label.slice(0, MAX_CHOICE_NAME - 1)}…`;
}

/** Tracks whose title, artist or album contains the query, case-insensitive, in Playlist order. */
export function matchTracks(tracks: readonly Track[], query: string, limit = MAX_CHOICES): Track[] {
  const needle = query.trim().toLowerCase();
  const matches = needle
    ? tracks.filter((t) => [t.title, t.artist, t.album].some((field) => field?.toLowerCase().includes(needle)))
    : tracks;
  return matches.slice(0, limit);
}

/** Autocomplete choices: the label, and the Track id as the value. */
export function trackChoices(tracks: readonly Track[], query: string): { name: string; value: string }[] {
  return matchTracks(tracks, query).map((track) => ({ name: choiceLabel(track), value: track.id }));
}

/**
 * The Track a `play` option names. Autocomplete sends the id; someone who
 * types and sends without picking sends their text, so fall back to the best
 * match for it.
 */
export function resolveTrack(tracks: readonly Track[], value: string): Track | null {
  return tracks.find((t) => t.id === value) ?? matchTracks(tracks, value, 1)[0] ?? null;
}

/** `m:ss`, or `h:mm:ss` past an hour. */
export function formatTime(totalSeconds: number | null): string {
  if (totalSeconds === null || !Number.isFinite(totalSeconds)) return "--:--";
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

/** Seconds into the current Track: moved on from the bot's last report while playing. */
export function elapsedSeconds(player: PlayerView, now: number): number {
  let ms = player.positionMs;
  if (player.state === "playing" && player.positionAt) ms += Math.max(0, now - Date.parse(player.positionAt));
  const total = player.track?.durationSeconds;
  return total ? Math.min(ms / 1000, total) : ms / 1000;
}

function trackLine(track: Track): string {
  const title = clip(track.title, MAX_FIELD.title);
  const by = [track.artist && clip(track.artist, MAX_FIELD.artist), track.album && clip(track.album, MAX_FIELD.album)]
    .filter(Boolean)
    .join(" · ");
  return by ? `**${title}** — ${by}` : `**${title}**`;
}

export function nowPlayingText(player: PlayerView, now: number): string {
  if (!player.online) return "The player is offline.";
  if (!player.track || player.state === "idle") {
    return player.failure
      ? `Nothing is playing. Playback stopped: ${clip(player.failure, MAX_FIELD.failure)}`
      : "Nothing is playing.";
  }
  const time = `${formatTime(elapsedSeconds(player, now))} / ${formatTime(player.track.durationSeconds)}`;
  const paused = player.state === "paused" ? " (paused)" : "";
  return `${trackLine(player.track)}\n\`${time}\`${paused}`;
}

/**
 * What is playing and the first `QUEUE_SHOWN` Queue entries. Lines stop
 * before the reply would pass `REPLY_BUDGET`, and the rest are counted.
 */
export function queueText(player: PlayerView, now: number): string {
  const lines = [`Now: ${nowPlayingText(player, now).replace("\n", " ")}`];
  if (player.queue.length === 0) {
    lines.push("The queue is empty. The playlist carries on after this song.");
    return lines.join("\n");
  }
  lines.push("", "Up next:");
  let length = lines.join("\n").length;
  let listed = 0;
  for (const entry of player.queue.slice(0, QUEUE_SHOWN)) {
    const line = `${listed + 1}. ${trackLine(entry.track)} (added by ${clip(entry.addedBy.name, MAX_FIELD.name)})`;
    if (length + 1 + line.length > REPLY_BUDGET) break;
    lines.push(line);
    length += 1 + line.length;
    listed += 1;
  }
  const rest = player.queue.length - listed;
  if (rest > 0) lines.push(`…and ${rest} more`);
  return lines.join("\n");
}

const REPEAT_TEXT = { off: "off", one: "this song", all: "the playlist" } as const;

export function repeatText(mode: "off" | "one" | "all"): string {
  return mode === "off" ? "Repeat is off." : `Repeating ${REPEAT_TEXT[mode]}.`;
}

/** What to tell the person when a `/jukebox` call fails. Always sent ephemerally. */
export function errorReply(err: unknown): string {
  if (err instanceof JukeboxNotConfigured) return "The Jukebox isn't set up on this bot.";
  if (err instanceof JukeboxSignInFailed || err instanceof JukeboxForbidden) {
    return "The Jukebox can't sign in to atrium. The owner has to check its account.";
  }
  if (err instanceof JukeboxUnavailable) return "Atrium is unreachable right now.";
  if (err instanceof JukeboxRequestError) {
    if (err.code === "PLAYER_OFFLINE" || err.code === "PLAYER_NOT_FOUND") return "The player is offline.";
    if (err.code === "NOT_A_TRACK") return "That isn't a song in the library. Pick one from the list.";
    if (err.code === "NOT_IN_VOICE") return "I'm not in a voice channel. Use `/jukebox join` from yours first.";
    return `Atrium refused that (${err.code ?? err.status}).`;
  }
  return "Something went wrong talking to atrium.";
}
