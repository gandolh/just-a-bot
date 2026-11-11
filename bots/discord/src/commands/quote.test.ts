import { test } from "node:test";
import assert from "node:assert/strict";
import { ChannelType, PermissionsBitField, type Channel } from "discord.js";
import { canQuoteFrom } from "./quote.ts";

const READ = [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ReadMessageHistory];
const MEMBER = "100000000000000009";

/** A stand-in channel: its type, the member's permissions (the parent's, for a thread), and a thread's members. */
function channel(type: ChannelType, perms: bigint[] | null, threadMembers: string[] = []) {
  let memberFetches = 0;
  const fake = {
    type,
    isDMBased: () => false,
    isTextBased: () => true,
    permissionsFor: () => (perms ? new PermissionsBitField(perms) : null),
    members: {
      fetch: async ({ member }: { member: string }) => {
        memberFetches += 1;
        if (!threadMembers.includes(member)) throw new Error("Unknown Member");
        return { id: member };
      },
    },
  };
  return { channel: fake as unknown as Channel, fetches: () => memberFetches };
}

test("a channel the member can read is quotable; one they cannot is not", async () => {
  assert.equal(await canQuoteFrom(channel(ChannelType.GuildText, READ).channel, MEMBER), true);
  assert.equal(
    await canQuoteFrom(channel(ChannelType.GuildText, [PermissionsBitField.Flags.ViewChannel]).channel, MEMBER),
    false,
  );
  assert.equal(await canQuoteFrom(channel(ChannelType.GuildText, null).channel, MEMBER), false, "member not in cache");
});

test("a public thread works as before, on the parent permissions alone", async () => {
  const thread = channel(ChannelType.PublicThread, READ);
  assert.equal(await canQuoteFrom(thread.channel, MEMBER), true);
  assert.equal(thread.fetches(), 0);
});

test("a private thread the member is not in is refused, even with the parent readable", async () => {
  assert.equal(await canQuoteFrom(channel(ChannelType.PrivateThread, READ, ["someone-else"]).channel, MEMBER), false);
});

test("a private thread is quotable by its members and by those who manage threads", async () => {
  assert.equal(await canQuoteFrom(channel(ChannelType.PrivateThread, READ, [MEMBER]).channel, MEMBER), true);
  const moderator = channel(ChannelType.PrivateThread, [...READ, PermissionsBitField.Flags.ManageThreads]);
  assert.equal(await canQuoteFrom(moderator.channel, MEMBER), true);
  assert.equal(moderator.fetches(), 0);
});
