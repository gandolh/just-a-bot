import { AttachmentBuilder } from 'discord.js';

export function pngAttachment(buf: Buffer, name: string): AttachmentBuilder {
  return new AttachmentBuilder(buf, { name });
}
