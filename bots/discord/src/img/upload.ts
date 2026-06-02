import type { ChatInputCommandInteraction } from 'discord.js';

/**
 * Upload a PNG to an interaction's deferred reply using Node's built-in fetch,
 * bypassing @discordjs/rest.
 *
 * @discordjs/rest@2.6.1 hangs indefinitely on multipart file uploads under
 * Node 24 (a bug in its own upload dispatch, independent of undici version),
 * while a plain multipart POST/PATCH via global fetch completes in ~300ms. This
 * targets the interaction webhook's @original message — the same edit that
 * `interaction.editReply({ files })` performs — authorized by the interaction
 * token (no bot token needed).
 *
 * Requires the interaction to already be deferred (so @original exists).
 */
export async function editReplyWithImage(
  interaction: ChatInputCommandInteraction,
  buf: Buffer,
  filename: string,
  opts: { content?: string; timeoutMs?: number } = {},
): Promise<void> {
  const url = `https://discord.com/api/v10/webhooks/${interaction.applicationId}/${interaction.token}/messages/@original`;

  const form = new FormData();
  const payload = {
    content: opts.content ?? '',
    attachments: [{ id: 0, filename }],
  };
  form.append('payload_json', JSON.stringify(payload));
  form.append('files[0]', new Blob([buf], { type: 'image/png' }), filename);

  const res = await fetch(url, {
    method: 'PATCH',
    body: form,
    signal: AbortSignal.timeout(opts.timeoutMs ?? 12_000),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Discord upload failed: ${res.status} ${res.statusText} ${detail}`.trim());
  }
}
