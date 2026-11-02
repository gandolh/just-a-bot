import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import type { OpenTrack } from './buffer.ts';
import { GuildPlayer, shouldApplyPlay, type PlayerApi } from './player.ts';
import type { Speaker, SpeakerHandlers, VoiceChannelInfo } from './speaker.ts';
import type { BotCommand, JukeboxPlay, Track } from './types.ts';

test('the first play after boot always applies', () => {
  assert.equal(shouldApplyPlay(null, 0), true);
  assert.equal(shouldApplyPlay(null, 57), true);
});

test('after that only a newer playId applies', () => {
  assert.equal(shouldApplyPlay(5, 6), true);
  assert.equal(shouldApplyPlay(5, 5), false, 'the same play delivered twice');
  assert.equal(shouldApplyPlay(6, 5), false, 'a play that lost the race with advance');
});

// --- A GuildPlayer against stand-ins for the speaker, the buffer and atrium ---

const GUILD = '100000000000000001';
const CHANNEL: VoiceChannelInfo = { id: '100000000000000002', name: 'Music' };

const track = (id: string): Track => ({
  id,
  title: `Song ${id}`,
  artist: null,
  album: null,
  trackNumber: null,
  durationSeconds: 180,
});

class FakeSpeaker implements Speaker {
  readonly guildId = GUILD;
  handlers: SpeakerHandlers = {};
  channel: VoiceChannelInfo | null = null;
  joinFails = false;
  plays = 0;
  guildName = () => 'Test guild';
  voiceChannels = () => [CHANNEL];
  connected = () => this.channel;
  async join(): Promise<void> {
    if (this.joinFails) {
      this.channel = null;
      throw new Error('the voice connection was not ready within 20 s');
    }
    this.channel = CHANNEL;
  }
  leave = () => void (this.channel = null);
  play = () => void (this.plays += 1);
  pause = () => {};
  resume = () => {};
  stop = () => {};
  positionMs = () => 0;
  setHandlers(handlers: SpeakerHandlers): void {
    this.handlers = handlers;
  }
}

const fakeBuffer = {
  update: () => {},
  open: async (): Promise<OpenTrack> => ({ stream: new PassThrough(), live: false, failed: () => false }),
  clear: async () => {},
};

function fakeApi(next: (playId: number) => { play: JukeboxPlay | null; stale?: true }) {
  const calls = { advance: [] as { playId: number; reason: string }[], reports: 0 };
  const api: PlayerApi = {
    advance: async (_guildId, playId, reason) => {
      calls.advance.push({ playId, reason });
      return next(playId);
    },
    control: async () => {},
    report: () => void (calls.reports += 1),
  };
  return { api, calls };
}

/** Let the player's command chain run to the end. */
async function settle(): Promise<void> {
  for (let i = 0; i < 20; i++) await new Promise((resolve) => setImmediate(resolve));
}

const command = <C extends Omit<BotCommand, 'id' | 'guildId'>>(body: C) => ({ id: 1, guildId: GUILD, ...body }) as BotCommand;
const playCommand = (playId: number, id: string) => command({ kind: 'play', playId, track: track(id), upcoming: [] });

test('a failed join reports no voice channel and stops playing', async () => {
  const speaker = new FakeSpeaker();
  const { api, calls } = fakeApi(() => ({ play: null }));
  const player = new GuildPlayer(GUILD, speaker, fakeBuffer, api);
  player.apply(command({ kind: 'join', channelId: CHANNEL.id }));
  player.apply(playCommand(1, 'a'));
  await settle();
  assert.equal(player.status().state, 'playing');

  // Asked to move to a channel it cannot get into.
  speaker.joinFails = true;
  const reportsBefore = calls.reports;
  player.apply(command({ kind: 'join', channelId: '100000000000000003' }));
  await settle();

  const status = player.status();
  assert.equal(status.voiceChannel, null);
  assert.equal(status.state, 'idle');
  assert.equal(calls.reports, reportsBefore + 1, 'one report, from the join');
});
