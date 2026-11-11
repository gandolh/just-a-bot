import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { VoiceConnectionStatus, type joinVoiceChannel } from "@discordjs/voice";
import type { Client } from "discord.js";
import { DiscordSpeaker } from "./speaker.ts";

const GUILD = "100000000000000001";
const CHANNEL = "100000000000000002";

/** A voice connection that never gets past Signalling, the way a channel without Connect behaves. */
class StuckConnection extends EventEmitter {
  state: { status: VoiceConnectionStatus } = { status: VoiceConnectionStatus.Signalling };
  readonly joinConfig = { channelId: CHANNEL };
  destroyCalls = 0;
  subscribe(): undefined {
    return undefined;
  }
  destroy(): void {
    this.destroyCalls += 1;
    const before = this.state;
    this.state = { status: VoiceConnectionStatus.Destroyed };
    this.emit(VoiceConnectionStatus.Destroyed, before, this.state);
  }
}

function fakeClient(): Client {
  const guild = {
    id: GUILD,
    name: "Test guild",
    voiceAdapterCreator: () => ({}),
    channels: { cache: new Map() },
    members: { me: null },
  };
  return { guilds: { cache: new Map([[GUILD, guild]]) } } as unknown as Client;
}

test("a join that never gets ready is destroyed and not left connected", async () => {
  const connection = new StuckConnection();
  const join = (() => connection) as unknown as typeof joinVoiceChannel;
  const speaker = new DiscordSpeaker(fakeClient(), GUILD, { join, readyTimeoutMs: 20 });
  let disconnected = 0;
  speaker.setHandlers({ disconnected: () => (disconnected += 1) });

  await assert.rejects(speaker.join(CHANNEL), /not ready within/);

  assert.equal(speaker.connected(), null);
  assert.equal(connection.destroyCalls, 1);
  assert.equal(disconnected, 0, "the caller reports the failed join; the Destroyed listener must not report it too");
});
