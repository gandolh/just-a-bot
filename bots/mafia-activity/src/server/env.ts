import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { loadEnv } from '@bots/shared';

const here = fileURLToPath(new URL('.', import.meta.url));
const envPath = resolve(here, '../../.env');

const schema = z.object({
  DISCORD_CLIENT_ID: z.string().regex(/^\d+$/),
  DISCORD_CLIENT_SECRET: z.string().min(1),
  SESSION_HMAC_KEY: z.string().min(16),
  HTTP_PORT: z.coerce.number().int().positive().default(3000),
  ENGINE_LISTEN_PORT: z.coerce.number().int().positive().default(3100),
  ENGINE_AUTH_TOKEN: z.string().min(16),
});

export const env = loadEnv(schema, { path: envPath });
