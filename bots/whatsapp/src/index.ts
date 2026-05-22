import Fastify from 'fastify';
import { logger } from '@bots/shared';
import { env } from './env.ts';
import { verifySignature } from './signature.ts';
import { handleMessage } from './handler.ts';

const log = logger.scoped('whatsapp');

const app = Fastify({
  logger: false,
  bodyLimit: 1024 * 1024,
});

app.addContentTypeParser(
  'application/json',
  { parseAs: 'string' },
  (_req, body, done) => {
    try {
      done(null, { raw: body as string, parsed: JSON.parse(body as string) });
    } catch (err) {
      done(err as Error);
    }
  },
);

app.get('/webhook', async (req, reply) => {
  const query = req.query as Record<string, string | undefined>;
  if (
    query['hub.mode'] === 'subscribe' &&
    query['hub.verify_token'] === env.WHATSAPP_VERIFY_TOKEN
  ) {
    log.info('Webhook verified');
    return reply.code(200).send(query['hub.challenge']);
  }
  return reply.code(403).send('Forbidden');
});

app.post('/webhook', async (req, reply) => {
  const { raw, parsed } = req.body as { raw: string; parsed: unknown };
  const signature = req.headers['x-hub-signature-256'];
  const header = Array.isArray(signature) ? signature[0] : signature;

  if (!verifySignature(raw, header)) {
    log.warn('Invalid signature on webhook');
    return reply.code(401).send('Invalid signature');
  }

  reply.code(200).send('EVENT_RECEIVED');

  const body = parsed as {
    entry?: Array<{
      changes?: Array<{
        value?: {
          messages?: Array<{
            from: string;
            id: string;
            type: string;
            text?: { body: string };
          }>;
        };
      }>;
    }>;
  };

  const messages = body.entry?.flatMap(
    (e) => e.changes?.flatMap((c) => c.value?.messages ?? []) ?? [],
  ) ?? [];

  for (const msg of messages) {
    handleMessage(msg).catch((err) => log.error('handleMessage failed', err));
  }
});

await app.listen({ port: env.PORT, host: '0.0.0.0' });
log.info(`Listening on :${env.PORT}`);
